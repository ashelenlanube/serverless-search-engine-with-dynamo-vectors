import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import type { ProductSuggestion } from '@serverless-search/shared';

type RawProduct = Record<string, unknown>;

export function productSuggestion(value: object): ProductSuggestion | undefined {
  const product = value as RawProduct;

  if (
    typeof product.id !== 'string' ||
    typeof product.name !== 'string' ||
    typeof product.description !== 'string' ||
    typeof product.category !== 'string' ||
    typeof product.score !== 'number'
  ) {
    return undefined;
  }
  if (typeof product.imageUrl !== 'string' && product.imageUrl !== undefined) return undefined;
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
    score: product.score,
  };
}

export function rawProduct(value: Record<string, AttributeValue>): RawProduct {
  return Object.fromEntries(
    Object.entries(value).map(([key, attribute]) => [key, decode(attribute)]),
  );
}

function decode(attribute: AttributeValue): unknown {
  if (attribute.S !== undefined) return attribute.S;
  if (attribute.N !== undefined) return Number(attribute.N);
  if (attribute.BOOL !== undefined) return attribute.BOOL;
  if (attribute.NULL) return null;
  if (attribute.SS !== undefined) return attribute.SS;
  if (attribute.NS !== undefined) return attribute.NS.map(Number);
  if (attribute.L !== undefined) return attribute.L.map(decode);
  if (attribute.M !== undefined) return rawProduct(attribute.M);
  return undefined;
}
