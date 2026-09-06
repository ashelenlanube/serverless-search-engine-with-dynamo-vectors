import { describe, expect, it } from 'vitest';
import { lexicalScore, rankCandidates, semanticScoreFromCosineDistance } from './ranking.js';

describe('ranking', () => {
  it('converts DynamoDB cosine distance into an intuitive score', () => {
    expect(semanticScoreFromCosineDistance(0)).toBe(1);
    expect(semanticScoreFromCosineDistance(1)).toBe(0.5);
    expect(semanticScoreFromCosineDistance(2)).toBe(0);
    expect(semanticScoreFromCosineDistance(3)).toBe(0);
  });

  it('gives exact names priority over prefix and semantic-only candidates', () => {
    const ranked = rankCandidates('cloud runner shoes', [
      {
        id: 'prod_semantic_only',
        normalizedName: 'trail sandals',
        description: 'Shoes for running in clouds',
        score: 1,
        cosineDistance: 0,
      },
      {
        id: 'prod_exact',
        normalizedName: 'cloud runner shoes',
        description: 'Lightweight running shoes',
        score: 1,
        cosineDistance: 0.4,
      },
    ]);
    expect(ranked.map((candidate) => candidate.id)).toEqual(['prod_exact', 'prod_semantic_only']);
  });

  it('allows name prefixes but not middle-of-name substrings through lexical autocomplete', () => {
    expect(lexicalScore('cloud', { normalizedName: 'cloud runner shoes', description: '' })).toBe(
      0.85,
    );
    expect(lexicalScore('runner', { normalizedName: 'cloud runner shoes', description: '' })).toBe(
      0,
    );
  });

  it('uses the highest applicable description bonus', () => {
    const candidate = {
      normalizedName: 'cloud runner shoes',
      description: 'Lightweight running shoes for warm weather training.',
    };
    expect(lexicalScore('warm weather', candidate)).toBe(0.7);
    expect(lexicalScore('warm training', candidate)).toBe(0.55);
    expect(lexicalScore('winter training', candidate)).toBe(0.35);
  });

  it('has deterministic ties', () => {
    const ranked = rankCandidates('none', [
      { id: 'prod_b', normalizedName: 'b', description: '', score: 1 },
      { id: 'prod_a', normalizedName: 'a', description: '', score: 1 },
    ]);
    expect(ranked.map((candidate) => candidate.id)).toEqual(['prod_a', 'prod_b']);
  });
});
