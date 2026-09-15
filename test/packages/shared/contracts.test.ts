import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  productInputSchema,
  searchResponseSchema,
} from '../../../packages/shared/src/contracts.js';

const PUBLIC_EMBEDDING_VALUE = 0.1;
const TOO_MANY_SEARCH_ITEMS = 6;
const MIN_CATALOG_PRODUCTS = 20;
const MAX_CATALOG_PRODUCTS = 50;

describe('API contracts', () => {
  it('accepts a valid seed product', () => {
    expect(
      productInputSchema.parse({
        id: '81d04927-ee96-4b17-82f4-83e9bee705a4',
        name: 'Cloud Runner Shoes',
        description: 'Lightweight running shoes for warm-weather training.',
        category: 'footwear',
        tags: ['running', 'lightweight'],
      }).id,
    ).toBe('81d04927-ee96-4b17-82f4-83e9bee705a4');
  });

  it('requires UUID product IDs', () => {
    expect(() =>
      productInputSchema.parse({
        id: 'prod_running_shoe_001',
        name: 'Cloud Runner Shoes',
        description: 'Lightweight running shoes.',
        category: 'footwear',
        tags: ['running'],
      }),
    ).toThrow();
  });

  it('rejects unexpected fields and public embeddings', () => {
    expect(() =>
      productInputSchema.parse({
        id: '81d04927-ee96-4b17-82f4-83e9bee705a4',
        name: 'Cloud Runner Shoes',
        description: 'Lightweight running shoes.',
        category: 'footwear',
        tags: ['running'],
        imageUrl: '/products/cloud-runner.webp',
        embedding: [PUBLIC_EMBEDDING_VALUE],
      }),
    ).toThrow();
  });

  it('keeps public search responses to five results', () => {
    expect(() =>
      searchResponseSchema.parse({ query: 'shoes', items: Array(TOO_MANY_SEARCH_ITEMS).fill({}) }),
    ).toThrow();
  });

  it('validates the committed seed catalog and keeps product IDs unique', () => {
    const dataFile = new URL('../../../data/products.json', import.meta.url);
    const products: unknown = JSON.parse(readFileSync(dataFile, 'utf8'));
    const catalog = productInputSchema
      .array()
      .min(MIN_CATALOG_PRODUCTS)
      .max(MAX_CATALOG_PRODUCTS)
      .parse(products);

    expect(new Set(catalog.map((product) => product.id)).size).toBe(catalog.length);
  });
});
