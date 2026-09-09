import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, SearchVectorsCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { normalizeText, rankCandidates } from '@serverless-search/shared';
import type { RankingCandidate } from '@serverless-search/shared';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { HTTP_STATUS, limitFromQuery, json } from './http.js';
import { productSuggestion, rawProduct } from './products.js';

const AUTOCOMPLETE_INDEX = 'AutocompleteIndex';
const EMBEDDING_DIMENSIONS = 512;
const LEXICAL_CANDIDATE_LIMIT = 10;
const SEMANTIC_CANDIDATE_LIMIT = 25;
const MODEL_ID = 'amazon.titan-embed-text-v2:0';
const QUERY_MAX_LENGTH = 100;
const NUMBER_ATTRIBUTE = 'N';

interface SearchDependencies {
  readonly bedrock: Pick<BedrockRuntimeClient, 'send'>;
  readonly document: Pick<DynamoDBDocumentClient, 'send'>;
  readonly dynamo: Pick<DynamoDBClient, 'send'>;
  readonly logger: SearchLogger;
  readonly tableName: string;
  readonly vectorIndex: string;
}

interface SearchLogger {
  error(event: SearchErrorEvent): void;
}

interface SearchErrorEvent {
  readonly errorMessage: string;
  readonly errorName: string;
  readonly operation: 'lexical-search' | 'semantic-search';
  readonly tableName: string;
  readonly vectorIndex: string;
}

interface RejectedResultOptions<T> {
  readonly operation: SearchErrorEvent['operation'];
  readonly result: PromiseSettledResult<T>;
}

interface VectorCandidate {
  readonly candidate: RankingCandidate;
  readonly cosineDistance: number;
}

type SearchHandler = (
  event: Pick<APIGatewayProxyEventV2, 'queryStringParameters'>,
) => Promise<APIGatewayProxyStructuredResultV2>;

export function createHandler(dependencies: SearchDependencies): SearchHandler {
  return async (event): Promise<APIGatewayProxyStructuredResultV2> => {
    const query = normalizeText(event.queryStringParameters?.q ?? '');
    if (query.length < 2 || query.length > QUERY_MAX_LENGTH) {
      return json(HTTP_STATUS.badRequest, { message: 'Invalid query.' });
    }

    const lexical = lexicalCandidates(dependencies, query);
    const semantic = semanticCandidates(dependencies, query);
    const [lexicalResult, semanticResult] = await Promise.allSettled([lexical, semantic]);
    logRejected(dependencies, { operation: 'lexical-search', result: lexicalResult });
    logRejected(dependencies, { operation: 'semantic-search', result: semanticResult });
    if (lexicalResult.status === 'rejected' && semanticResult.status === 'rejected') {
      return json(HTTP_STATUS.serverError, { message: 'Unable to search products.' });
    }

    const candidates = mergeCandidates(
      lexicalResult.status === 'fulfilled' ? lexicalResult.value : [],
      semanticResult.status === 'fulfilled' ? semanticResult.value : [],
    );
    const items = rankCandidates(query, candidates)
      .slice(0, limitFromQuery(event.queryStringParameters?.limit))
      .flatMap((candidate) => {
        const suggestion = productSuggestion(candidate);
        if (!suggestion) return [];
        return [
          {
            ...suggestion,
            match: {
              kind:
                semanticResult.status === 'fulfilled' ? ('hybrid' as const) : ('lexical' as const),
              rankingScore: candidate.rankingScore,
            },
          },
        ];
      });
    return json(HTTP_STATUS.success, { query, items });
  };
}

function logRejected<T>(dependencies: SearchDependencies, options: RejectedResultOptions<T>): void {
  if (options.result.status !== 'rejected') return;
  const reason = options.result.reason;
  const error = reason instanceof Error ? reason : new Error(String(reason));
  dependencies.logger.error({
    operation: options.operation,
    errorName: error.name,
    errorMessage: error.message,
    tableName: dependencies.tableName,
    vectorIndex: dependencies.vectorIndex,
  });
}

async function lexicalCandidates(
  dependencies: SearchDependencies,
  query: string,
): Promise<RankingCandidate[]> {
  const response = await dependencies.document.send(
    new QueryCommand({
      TableName: dependencies.tableName,
      IndexName: AUTOCOMPLETE_INDEX,
      KeyConditionExpression: 'nameInitial = :nameInitial AND begins_with(normalizedName, :query)',
      ExpressionAttributeValues: { ':nameInitial': query.slice(0, 1), ':query': query },
      Limit: LEXICAL_CANDIDATE_LIMIT,
    }),
  );
  return (response.Items ?? []).flatMap((item) => {
    const candidate = candidateFromRaw(item);
    return candidate ? [candidate] : [];
  });
}

async function semanticCandidates(
  dependencies: SearchDependencies,
  query: string,
): Promise<VectorCandidate[]> {
  const embedding = await queryEmbedding(dependencies.bedrock, query);
  const response = await dependencies.dynamo.send(
    new SearchVectorsCommand({
      TableName: dependencies.tableName,
      IndexName: dependencies.vectorIndex,
      SearchVector: embedding.map((value) => ({ [NUMBER_ATTRIBUTE]: String(value) })),
      TopK: SEMANTIC_CANDIDATE_LIMIT,
    }),
  );
  return (response.SearchResults ?? []).flatMap((result) => {
    if (!result.Item || typeof result.Score !== 'number') return [];
    const candidate = candidateFromRaw(rawProduct(result.Item));
    return candidate ? [{ candidate, cosineDistance: result.Score }] : [];
  });
}

async function queryEmbedding(
  bedrock: Pick<BedrockRuntimeClient, 'send'>,
  query: string,
): Promise<number[]> {
  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(
        JSON.stringify({ inputText: query, dimensions: EMBEDDING_DIMENSIONS, normalize: true }),
      ),
    }),
  );
  const parsed = JSON.parse(new TextDecoder().decode(response.body)) as { embedding?: unknown };
  if (!Array.isArray(parsed.embedding) || parsed.embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error('Titan returned an invalid embedding.');
  }
  if (!parsed.embedding.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('Titan returned an invalid embedding.');
  }
  return parsed.embedding;
}

function candidateFromRaw(value: Record<string, unknown>): RankingCandidate | undefined {
  if (
    typeof value.id !== 'string' ||
    typeof value.normalizedName !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.score !== 'number'
  ) {
    return undefined;
  }
  return {
    id: value.id,
    normalizedName: value.normalizedName,
    description: value.description,
    score: value.score,
    ...value,
  };
}

function mergeCandidates(
  lexical: readonly RankingCandidate[],
  semantic: readonly VectorCandidate[],
): RankingCandidate[] {
  const candidates = new Map<string, RankingCandidate>();
  for (const candidate of lexical) candidates.set(candidate.id, candidate);
  for (const { candidate, cosineDistance } of semantic) {
    candidates.set(candidate.id, { ...candidates.get(candidate.id), ...candidate, cosineDistance });
  }
  return [...candidates.values()];
}

const tableName = process.env.TABLE_NAME;
const vectorIndex = process.env.VECTOR_INDEX;
const dynamo = new DynamoDBClient({});
const logger: SearchLogger = {
  error: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
};

export const handler = createHandler({
  bedrock: new BedrockRuntimeClient({}),
  document: DynamoDBDocumentClient.from(dynamo),
  dynamo,
  logger,
  tableName: tableName ?? '',
  vectorIndex: vectorIndex ?? '',
});
