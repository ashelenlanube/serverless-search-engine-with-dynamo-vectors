import { describe, expect, it } from 'vitest';
import {
  nameInitial,
  normalizeText,
  productEmbeddingInput,
  tokenizeNormalizedText,
} from '../../../packages/shared/src/normalization.js';

describe('normalizeText', () => {
  it('normalizes case, whitespace, punctuation, and diacritics', () => {
    expect(normalizeText('  CAFÉ—Running!  Shoes  ')).toBe('cafe running shoes');
  });

  it('returns an empty string for punctuation and whitespace', () => {
    expect(normalizeText('  !!!  ')).toBe('');
  });
});

describe('normalization helpers', () => {
  it('derives the autocomplete partition key from a normalized name', () => {
    expect(nameInitial('cloud runner shoes')).toBe('c');
    expect(nameInitial('')).toBe('');
  });

  it('creates stable labeled embedding input', () => {
    expect(
      productEmbeddingInput({
        name: 'Cloud Runner Shoes',
        category: 'footwear',
        description: 'Lightweight shoes.',
        tags: ['running', 'summer'],
      }),
    ).toBe(
      'Name: Cloud Runner Shoes\nCategory: footwear\nDescription: Lightweight shoes.\nTags: running, summer',
    );
    expect(tokenizeNormalizedText('summer shoes')).toEqual(['summer', 'shoes']);
  });
});
