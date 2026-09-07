import { normalizeText, tokenizeNormalizedText } from './normalization.js';

const EXACT_NAME_SCORE = 1;
const PREFIX_NAME_SCORE = 0.85;
const DESCRIPTION_MATCH_SCORE = 0.7;
const ALL_TOKEN_MATCH_SCORE = 0.55;
const PARTIAL_TOKEN_MATCH_SCORE = 0.35;
const MAX_COSINE_DISTANCE = 2;

export const RANKING_WEIGHTS = {
  lexical: 0.5,
  semantic: 0.45,
  popularity: 0.05,
} as const;

export interface RankingCandidate {
  id: string;
  normalizedName: string;
  description: string;
  score: number;
  cosineDistance?: number;
}

export interface RankedCandidate extends RankingCandidate {
  lexicalScore: number;
  semanticScore: number;
  popularityScore: number;
  rankingScore: number;
}

export function lexicalScore(
  query: string,
  candidate: Pick<RankingCandidate, 'normalizedName' | 'description'>,
): number {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;
  if (candidate.normalizedName === normalizedQuery) return EXACT_NAME_SCORE;
  if (candidate.normalizedName.startsWith(normalizedQuery)) return PREFIX_NAME_SCORE;

  const description = normalizeText(candidate.description);
  if (description.includes(normalizedQuery)) return DESCRIPTION_MATCH_SCORE;

  const tokens = tokenizeNormalizedText(normalizedQuery);
  const matchingTokens = tokens.filter((token) => description.includes(token)).length;
  if (matchingTokens === tokens.length) return ALL_TOKEN_MATCH_SCORE;
  if (matchingTokens > 0) return PARTIAL_TOKEN_MATCH_SCORE;
  return 0;
}

export function semanticScoreFromCosineDistance(distance: number | undefined): number {
  if (distance === undefined || !Number.isFinite(distance)) return 0;
  return Math.min(EXACT_NAME_SCORE, Math.max(0, EXACT_NAME_SCORE - distance / MAX_COSINE_DISTANCE));
}

export function popularityScore(score: number, maxScore: number): number {
  if (score <= 0 || maxScore <= 0) return 0;
  return Math.log1p(score) / Math.log1p(maxScore);
}

export function rankCandidates(
  query: string,
  candidates: readonly RankingCandidate[],
): RankedCandidate[] {
  const maxScore = Math.max(0, ...candidates.map((candidate) => candidate.score));

  return candidates
    .map((candidate) => {
      const lexical = lexicalScore(query, candidate);
      const semantic = semanticScoreFromCosineDistance(candidate.cosineDistance);
      const popularity = popularityScore(candidate.score, maxScore);
      return {
        ...candidate,
        lexicalScore: lexical,
        semanticScore: semantic,
        popularityScore: popularity,
        rankingScore:
          RANKING_WEIGHTS.lexical * lexical +
          RANKING_WEIGHTS.semantic * semantic +
          RANKING_WEIGHTS.popularity * popularity,
      };
    })
    .sort(
      (left, right) => right.rankingScore - left.rankingScore || left.id.localeCompare(right.id),
    );
}
