import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { productIdSchema } from '@serverless-search/shared';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { HTTP_STATUS, json } from './http.js';

const SCORE_INCREMENT = 1;

interface ClickDependencies {
  readonly document: Pick<DynamoDBDocumentClient, 'send'>;
  readonly tableName: string;
}

type ClickHandler = (
  event: Pick<APIGatewayProxyEventV2, 'pathParameters'>,
) => Promise<APIGatewayProxyStructuredResultV2>;

export function createHandler(dependencies: ClickDependencies): ClickHandler {
  return async (event): Promise<APIGatewayProxyStructuredResultV2> => {
    const id = event.pathParameters?.id;
    if (!productIdSchema.safeParse(id).success) {
      return json(HTTP_STATUS.badRequest, { message: 'Invalid product id.' });
    }
    try {
      const response = await dependencies.document.send(
        new UpdateCommand({
          TableName: dependencies.tableName,
          Key: { id },
          UpdateExpression: 'ADD #score :increment',
          ConditionExpression: 'attribute_exists(id)',
          ExpressionAttributeNames: { '#score': 'score' },
          ExpressionAttributeValues: { ':increment': SCORE_INCREMENT },
          ReturnValues: 'UPDATED_NEW',
        }),
      );
      const score = response.Attributes?.score;
      if (typeof score !== 'number') {
        return json(HTTP_STATUS.serverError, { message: 'Unable to record product click.' });
      }
      return json(HTTP_STATUS.success, { id, score });
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return json(HTTP_STATUS.notFound, { message: 'Product not found.' });
      }
      return json(HTTP_STATUS.serverError, { message: 'Unable to record product click.' });
    }
  };
}

const tableName = process.env.TABLE_NAME;

export const handler = createHandler({
  document: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  tableName: tableName ?? '',
});
