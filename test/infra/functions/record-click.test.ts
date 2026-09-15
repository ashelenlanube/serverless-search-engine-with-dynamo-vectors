import type { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../../infra/functions/record-click.js';

const id = '81d04927-ee96-4b17-82f4-83e9bee705a4';

function event(pathId = id): APIGatewayProxyEventV2 {
  return { pathParameters: { id: pathId } } as unknown as APIGatewayProxyEventV2;
}

describe('record-click handler', () => {
  it('atomically increments an existing product score', async () => {
    const send = vi.fn().mockResolvedValue({ Attributes: { score: 9 } });
    const handler = createHandler({ document: { send }, tableName: 'Products' });
    const response = await handler(event());

    expect(JSON.parse(response.body ?? '')).toEqual({ id, score: 9 });
    const command = send.mock.calls[0]?.[0] as UpdateCommand;

    expect(command.input).toMatchObject({
      Key: { id },
      UpdateExpression: 'ADD #score :increment',
      ConditionExpression: 'attribute_exists(id)',
    });
  });

  it('maps a missing product to 404 without creating it', async () => {
    const error = new Error('missing');

    error.name = 'ConditionalCheckFailedException';
    const send = vi.fn().mockRejectedValue(error);
    const handler = createHandler({ document: { send }, tableName: 'Products' });
    const response = await handler(event());

    expect(response).toMatchObject({ statusCode: 404 });
  });

  it('rejects invalid product identifiers before writing', async () => {
    const send = vi.fn();
    const handler = createHandler({ document: { send }, tableName: 'Products' });
    const response = await handler(event('not-a-uuid'));

    expect(response).toMatchObject({ statusCode: 400 });
    expect(send).not.toHaveBeenCalled();
  });
});
