import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  nameInitial,
  normalizeText,
  productEmbeddingInput,
  productInputSchema,
} from '@serverless-search/shared';
import type { ProductInput } from '@serverless-search/shared';

const MODEL_ID = 'amazon.titan-embed-text-v2:0';
const EMBEDDING_DIMENSIONS = 512;
const DEFAULT_OUTPUTS_FILE = 'cdk-outputs.json';
const MAX_VECTOR_INDEX_WAIT_MINUTES = 30;
const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_SECOND = 1_000;
const MAX_VECTOR_INDEX_WAIT_MS =
  MAX_VECTOR_INDEX_WAIT_MINUTES * MINUTES_PER_HOUR * MILLISECONDS_PER_SECOND;
const VECTOR_INDEX_POLL_INTERVAL_MS = 10_000;
const MAX_EMBEDDING_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 200;
const MAX_RETRY_JITTER_MS = 100;
const SEED_CONCURRENCY = 4;
const INITIAL_SCORE = 1;

interface SeedOptions {
  readonly tableName?: string;
  readonly vectorIndexName?: string;
  readonly region?: string;
  readonly outputsFile: string;
  readonly dryRun: boolean;
  readonly resetScores: boolean;
}

interface SeedTarget {
  readonly tableName: string;
  readonly vectorIndexName: string;
}

type SeedCounts = { inserted: number; updated: number; skipped: number; failed: number };

interface EmbeddingOptions {
  readonly client: BedrockRuntimeClient;
  readonly inputText: string;
  readonly attempt?: number;
}

interface ConcurrentMapOptions<T> {
  readonly values: readonly T[];
  readonly concurrency: number;
  readonly worker: (value: T) => Promise<void>;
}

interface SeedProductOptions {
  readonly product: ProductInput;
  readonly document: DynamoDBDocumentClient;
  readonly bedrock: BedrockRuntimeClient;
  readonly target: SeedTarget;
  readonly resetScores: boolean;
  readonly counts: SeedCounts;
}

function usage(): never {
  throw new Error(
    'Usage: npm run seed -- [--table-name NAME --vector-index-name NAME] [--outputs FILE] [--region REGION] [--dry-run] [--reset-scores]',
  );
}

function parseOptions(args: readonly string[]): SeedOptions {
  let tableName: string | undefined;
  let vectorIndexName: string | undefined;
  let region: string | undefined;
  let outputsFile = DEFAULT_OUTPUTS_FILE;
  let dryRun = false;
  let resetScores = false;
  const flagOptions: Record<string, () => void> = {
    '--dry-run': () => {
      dryRun = true;
    },
    '--reset-scores': () => {
      resetScores = true;
    },
  };
  const valueOptions: Record<string, (value: string) => void> = {
    '--table-name': (value) => {
      tableName = value;
    },
    '--vector-index-name': (value) => {
      vectorIndexName = value;
    },
    '--outputs': (value) => {
      outputsFile = value;
    },
    '--region': (value) => {
      region = value;
    },
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const flagOption = flagOptions[argument];

    if (flagOption) {
      flagOption();
      continue;
    }
    const valueOption = valueOptions[argument];

    if (!valueOption) usage();
    valueOption(args[++index] ?? usage());
  }

  return { tableName, vectorIndexName, region, outputsFile, dryRun, resetScores };
}

async function resolveTarget(options: SeedOptions): Promise<SeedTarget> {
  if (options.tableName && options.vectorIndexName) {
    return { tableName: options.tableName, vectorIndexName: options.vectorIndexName };
  }

  const contents = await readFile(resolve(options.outputsFile), 'utf8');
  const outputs: unknown = JSON.parse(contents);
  const stackOutputs = Object.values(outputs as Record<string, unknown>).find(
    (value): value is Record<string, unknown> =>
      typeof value === 'object' &&
      value !== null &&
      typeof value.ProductsTableName === 'string' &&
      typeof value.ProductEmbeddingIndexName === 'string',
  );

  if (!stackOutputs) {
    throw new Error(
      `Could not find ProductsTableName and ProductEmbeddingIndexName in ${options.outputsFile}. Pass both explicit flags instead.`,
    );
  }

  return {
    tableName: options.tableName ?? (stackOutputs.ProductsTableName as string),
    vectorIndexName: options.vectorIndexName ?? (stackOutputs.ProductEmbeddingIndexName as string),
  };
}

async function waitForActiveVectorIndex(client: DynamoDBClient, target: SeedTarget): Promise<void> {
  const deadline = Date.now() + MAX_VECTOR_INDEX_WAIT_MS;

  while (Date.now() < deadline) {
    const response = await client.send(new DescribeTableCommand({ TableName: target.tableName }));
    const index = response.Table?.VectorIndexes?.find(
      (candidate) => candidate.IndexName === target.vectorIndexName,
    );

    if (index?.IndexStatus === 'ACTIVE') return;

    await new Promise<void>((resolveDelay) =>
      setTimeout(resolveDelay, VECTOR_INDEX_POLL_INTERVAL_MS),
    );
  }

  throw new Error(`Timed out waiting for vector index ${target.vectorIndexName} to become ACTIVE.`);
}

function isRetryable(error: unknown): boolean {
  const name = error instanceof Error ? error.name : undefined;

  return (
    name === 'ThrottlingException' ||
    name === 'ServiceUnavailableException' ||
    name === 'InternalServerException'
  );
}

async function embed({ client, inputText, attempt = 0 }: EmbeddingOptions): Promise<number[]> {
  try {
    const response = await client.send(
      new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(
          JSON.stringify({ inputText, dimensions: EMBEDDING_DIMENSIONS, normalize: true }),
        ),
      }),
    );
    const body = JSON.parse(new TextDecoder().decode(response.body)) as { embedding?: unknown };

    if (!Array.isArray(body.embedding) || body.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Titan returned an embedding with ${Array.isArray(body.embedding) ? body.embedding.length : 0} dimensions.`,
      );
    }
    if (!body.embedding.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new Error('Titan returned an embedding containing a non-finite value.');
    }

    return body.embedding;
  } catch (error) {
    if (!isRetryable(error) || attempt >= MAX_EMBEDDING_RETRIES) throw error;
    const delayMs =
      RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * MAX_RETRY_JITTER_MS);

    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, delayMs));
    return embed({ client, inputText, attempt: attempt + 1 });
  }
}

async function mapWithConcurrency<T>({
  values,
  concurrency,
  worker,
}: ConcurrentMapOptions<T>): Promise<void> {
  let nextIndex = 0;

  async function run(): Promise<void> {
    while (nextIndex < values.length) {
      await worker(values[nextIndex++]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => run()));
}

async function seedProduct({
  product,
  document,
  bedrock,
  target,
  resetScores,
  counts,
}: SeedProductOptions): Promise<void> {
  try {
    const normalizedName = normalizeText(product.name);
    const embedding = await embed({ client: bedrock, inputText: productEmbeddingInput(product) });
    const setExpressions = [
      '#name = :name',
      '#normalizedName = :normalizedName',
      '#nameInitial = :nameInitial',
      '#description = :description',
      '#category = :category',
      '#tags = :tags',
      '#popularityKey = :popularityKey',
      '#embeddingModel = :embeddingModel',
      '#embeddingDimensions = :embeddingDimensions',
      '#embedding = :embedding',
      resetScores ? '#score = :initialScore' : '#score = if_not_exists(#score, :initialScore)',
    ];
    const names: Record<string, string> = {
      '#name': 'name',
      '#normalizedName': 'normalizedName',
      '#nameInitial': 'nameInitial',
      '#description': 'description',
      '#category': 'category',
      '#tags': 'tags',
      '#popularityKey': 'popularityKey',
      '#embeddingModel': 'embeddingModel',
      '#embeddingDimensions': 'embeddingDimensions',
      '#embedding': 'embedding',
      '#score': 'score',
    };

    if (product.imageUrl) {
      names['#imageUrl'] = 'imageUrl';
      setExpressions.push('#imageUrl = :imageUrl');
    }
    const removeExpression = product.imageUrl ? undefined : 'REMOVE #imageUrl';

    if (removeExpression) names['#imageUrl'] = 'imageUrl';

    const response = await document.send(
      new UpdateCommand({
        TableName: target.tableName,
        Key: { id: product.id },
        UpdateExpression: `SET ${setExpressions.join(', ')}${removeExpression ? ` ${removeExpression}` : ''}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: {
          ':name': product.name,
          ':normalizedName': normalizedName,
          ':nameInitial': nameInitial(normalizedName),
          ':description': product.description,
          ':category': product.category,
          ':tags': product.tags,
          ':popularityKey': 'POPULAR',
          ':embeddingModel': MODEL_ID,
          ':embeddingDimensions': EMBEDDING_DIMENSIONS,
          ':embedding': embedding,
          ':initialScore': INITIAL_SCORE,
          ':imageUrl': product.imageUrl,
        },
        ReturnValues: 'ALL_OLD',
      }),
    );

    if (response.Attributes?.score === undefined) counts.inserted += 1;
    else counts.updated += 1;
  } catch (error) {
    counts.failed += 1;
    process.stderr.write(
      `Failed to seed ${product.id}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

async function loadProducts(): Promise<ProductInput[]> {
  const catalogContents = await readFile(resolve('data/products.json'), 'utf8');

  return productInputSchema.array().min(1).parse(JSON.parse(catalogContents));
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const products = await loadProducts();

  if (options.dryRun) {
    process.stdout.write(
      `Validated ${products.length} products. Dry run makes no AWS calls or writes.\n`,
    );
    return;
  }

  const target = await resolveTarget(options);
  const dynamo = new DynamoDBClient({ region: options.region });
  const document = DynamoDBDocumentClient.from(dynamo, {
    marshallOptions: { removeUndefinedValues: true },
  });
  const bedrock = new BedrockRuntimeClient({ region: options.region });
  const counts: SeedCounts = { inserted: 0, updated: 0, skipped: 0, failed: 0 };

  await waitForActiveVectorIndex(dynamo, target);
  await mapWithConcurrency({
    values: products,
    concurrency: SEED_CONCURRENCY,
    worker: async (product) =>
      seedProduct({ product, document, bedrock, target, resetScores: options.resetScores, counts }),
  });

  process.stdout.write(
    `Seed complete: inserted=${counts.inserted} updated=${counts.updated} skipped=${counts.skipped} failed=${counts.failed}\n`,
  );
  if (counts.failed > 0) process.exitCode = 1;
}

await main();
