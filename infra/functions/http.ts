import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const DEFAULT_LIMIT = 5;
const MINIMUM_LIMIT = 1;
const MAXIMUM_LIMIT = 5;

export const HTTP_STATUS = {
  success: 200,
  badRequest: 400,
  notFound: 404,
  serverError: 500,
} as const;

export function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function limitFromQuery(value: string | undefined): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAXIMUM_LIMIT, Math.max(MINIMUM_LIMIT, parsed));
}
