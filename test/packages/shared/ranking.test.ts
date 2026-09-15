import { describe, expect, it } from 'vitest';
import {
  lexicalScore,
  rankCandidates,
  semanticScoreFromCosineDistance,
} from '../../../packages/shared/src/ranking.js';

const HALF_SCORE = 0.5;
const OUT_OF_RANGE_DISTANCE = 3;
const EXACT_CANDIDATE_DISTANCE = 0.4;
const PREFIX_SCORE = 0.85;
const DESCRIPTION_MATCH_SCORE = 0.7;
const ALL_TOKEN_MATCH_SCORE = 0.55;
const PARTIAL_TOKEN_MATCH_SCORE = 0.35;

describe('ranking', () => {
  it('converts DynamoDB cosine distance into an intuitive score', () => {
    expect(semanticScoreFromCosineDistance(0)).toBe(1);
    expect(semanticScoreFromCosineDistance(1)).toBe(HALF_SCORE);
    expect(semanticScoreFromCosineDistance(2)).toBe(0);
    expect(semanticScoreFromCosineDistance(OUT_OF_RANGE_DISTANCE)).toBe(0);
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
        cosineDistance: EXACT_CANDIDATE_DISTANCE,
      },
    ]);
    expect(ranked.map((candidate) => candidate.id)).toEqual(['prod_exact', 'prod_semantic_only']);
  });

  it('allows name prefixes but not middle-of-name substrings through lexical autocomplete', () => {
    expect(lexicalScore('cloud', { normalizedName: 'cloud runner shoes', description: '' })).toBe(
      PREFIX_SCORE,
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
    expect(lexicalScore('warm weather', candidate)).toBe(DESCRIPTION_MATCH_SCORE);
    expect(lexicalScore('warm training', candidate)).toBe(ALL_TOKEN_MATCH_SCORE);
    expect(lexicalScore('winter training', candidate)).toBe(PARTIAL_TOKEN_MATCH_SCORE);
  });

  it('has deterministic ties', () => {
    const ranked = rankCandidates('none', [
      { id: 'prod_b', normalizedName: 'b', description: '', score: 1 },
      { id: 'prod_a', normalizedName: 'a', description: '', score: 1 },
    ]);
    expect(ranked.map((candidate) => candidate.id)).toEqual(['prod_a', 'prod_b']);
  });
});
