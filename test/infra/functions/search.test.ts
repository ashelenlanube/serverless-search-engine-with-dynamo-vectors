import type { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import type { SearchVectorsCommand } from '@aws-sdk/client-dynamodb';
import type { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../../infra/functions/search.js';

const product = {
  id: '81d04927-ee96-4b17-82f4-83e9bee705a4',
  name: 'Cloud Runner Shoes',
  normalizedName: 'cloud runner shoes',
  description: 'Lightweight running shoes for warm-weather training.',
  category: 'footwear',
  score: 4,
};
const TEST_VALUES = { embeddingDimension: 512, embeddingValue: 0.1, overlongLength: 101 } as const;
const ATTRIBUTE_NAMES = { string: 'S', number: 'N' } as const;
const QUERY_PARAMETER = 'q';
const embedding = Array.from(
  { length: TEST_VALUES.embeddingDimension },
  () => TEST_VALUES.embeddingValue,
);

function event(query: string): APIGatewayProxyEventV2 {
  return {
    queryStringParameters: { [QUERY_PARAMETER]: query },
  } as unknown as APIGatewayProxyEventV2;
}

function dependencies() {
  return {
    bedrock: { send: vi.fn().mockResolvedValue(body({ embedding })) },
    document: { send: vi.fn().mockResolvedValue({ Items: [product] }) },
    dynamo: { send: vi.fn().mockResolvedValue({ SearchResults: [] }) },
    logger: { error: vi.fn() },
    tableName: 'Products',
    vectorIndex: 'ProductEmbeddingIndex',
  };
}

function body(value: unknown) {
  return { body: new TextEncoder().encode(JSON.stringify(value)) };
}

describe('search handler', () => {
  it('retrieves lexical and semantic candidates with the expected model and index', async () => {
    const services = dependencies();

    services.dynamo.send.mockResolvedValue({
      SearchResults: [
        {
          Item: {
            id: { [ATTRIBUTE_NAMES.string]: product.id },
            name: { [ATTRIBUTE_NAMES.string]: product.name },
            normalizedName: { [ATTRIBUTE_NAMES.string]: product.normalizedName },
            description: { [ATTRIBUTE_NAMES.string]: product.description },
            category: { [ATTRIBUTE_NAMES.string]: product.category },
            score: { [ATTRIBUTE_NAMES.number]: '4' },
          },
          Score: 0.2,
        },
      ],
    });
    const handler = createHandler(services);
    const response = await handler(event('cloud'));

    expect(response).toMatchObject({ statusCode: 200 });
    expect(JSON.parse(response.body ?? '').items[0]).toMatchObject({
      id: product.id,
      match: { kind: 'hybrid' },
    });
    const bedrockCommand = services.bedrock.send.mock.calls[0]?.[0] as InvokeModelCommand;

    expect(JSON.parse(new TextDecoder().decode(bedrockCommand.input.body as Uint8Array))).toEqual({
      inputText: 'cloud',
      dimensions: 512,
      normalize: true,
    });
    const lexicalCommand = services.document.send.mock.calls[0]?.[0] as QueryCommand;

    expect(lexicalCommand.input).toMatchObject({
      IndexName: 'AutocompleteIndex',
      Limit: 10,
      ExpressionAttributeValues: { ':nameInitial': 'c', ':query': 'cloud' },
    });
    const vectorCommand = services.dynamo.send.mock.calls[0]?.[0] as SearchVectorsCommand;

    expect(vectorCommand.input).toMatchObject({
      TableName: 'Products',
      IndexName: 'ProductEmbeddingIndex',
      TopK: 25,
    });
  });

  it('falls back to lexical results when Bedrock is unavailable', async () => {
    const services = dependencies();

    services.bedrock.send.mockRejectedValue(new Error('Bedrock unavailable'));
    const handler = createHandler(services);
    const response = await handler(event('cloud'));

    expect(response).toMatchObject({ statusCode: 200 });
    expect(JSON.parse(response.body ?? '').items[0].match.kind).toBe('lexical');
    expect(services.logger.error).toHaveBeenCalledWith({
      operation: 'semantic-search',
      errorName: 'Error',
      errorMessage: 'Bedrock unavailable',
      tableName: 'Products',
      vectorIndex: 'ProductEmbeddingIndex',
    });
  });

  it('rejects empty, short, and overlong normalized queries', async () => {
    const services = dependencies();
    const handler = createHandler(services);
    const shortResponse = await handler(event(' x '));
    const longResponse = await handler(event('x'.repeat(TEST_VALUES.overlongLength)));

    expect(shortResponse).toMatchObject({ statusCode: 400 });
    expect(longResponse).toMatchObject({ statusCode: 400 });
    expect(services.document.send).not.toHaveBeenCalled();
  });
});
