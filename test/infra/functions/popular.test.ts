import type { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../../infra/functions/popular.js';

const product = {
  id: '81d04927-ee96-4b17-82f4-83e9bee705a4',
  name: 'Cloud Runner Shoes',
  description: 'Lightweight running shoes.',
  category: 'footwear',
  score: 4,
};

function event(limit?: string): APIGatewayProxyEventV2 {
  return {
    queryStringParameters: limit ? { limit } : undefined,
  } as unknown as APIGatewayProxyEventV2;
}

describe('popular handler', () => {
  it('queries the popularity index in descending order and clamps the limit', async () => {
    const send = vi.fn().mockResolvedValue({ Items: [product] });
    const handler = createHandler({ document: { send }, tableName: 'Products' });
    const response = await handler(event('99'));

    expect(response).toMatchObject({ statusCode: 200 });
    expect(JSON.parse(response.body ?? '')).toEqual({ items: [product] });
    const command = send.mock.calls[0]?.[0] as QueryCommand;

    expect(command.input).toMatchObject({
      TableName: 'Products',
      IndexName: 'PopularityIndex',
      ScanIndexForward: false,
      Limit: 5,
    });
  });

  it('returns a generic error when DynamoDB fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('unavailable'));
    const handler = createHandler({ document: { send }, tableName: 'Products' });
    const response = await handler(event());

    expect(response).toMatchObject({ statusCode: 500 });
  });
});
