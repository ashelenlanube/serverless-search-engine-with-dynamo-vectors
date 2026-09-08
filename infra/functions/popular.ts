import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { HTTP_STATUS, limitFromQuery, json } from './http.js';
import { productSuggestion } from './products.js';

const POPULARITY_INDEX = 'PopularityIndex';
const POPULARITY_KEY = 'POPULAR';

interface PopularDependencies {
  readonly document: Pick<DynamoDBDocumentClient, 'send'>;
  readonly tableName: string;
}

type PopularHandler = (
  event: Pick<APIGatewayProxyEventV2, 'queryStringParameters'>,
) => Promise<APIGatewayProxyStructuredResultV2>;

export function createHandler(dependencies: PopularDependencies): PopularHandler {
  return async (event): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      const limit = limitFromQuery(event.queryStringParameters?.limit);
      const response = await dependencies.document.send(
        new QueryCommand({
          TableName: dependencies.tableName,
          IndexName: POPULARITY_INDEX,
          KeyConditionExpression: 'popularityKey = :popularityKey',
          ExpressionAttributeValues: { ':popularityKey': POPULARITY_KEY },
          ScanIndexForward: false,
          Limit: limit,
        }),
      );
      const items = (response.Items ?? []).flatMap((item) => {
        const suggestion = productSuggestion(item);
        return suggestion ? [suggestion] : [];
      });
      return json(HTTP_STATUS.success, { items });
    } catch {
      return json(HTTP_STATUS.serverError, { message: 'Unable to load popular products.' });
    }
  };
}

const tableName = process.env.TABLE_NAME;

export const handler = createHandler({
  document: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  tableName: tableName ?? '',
});
