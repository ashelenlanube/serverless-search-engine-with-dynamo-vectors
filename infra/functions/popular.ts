import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

export const handler: APIGatewayProxyHandlerV2 = async () => ({
  statusCode: 501,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ message: 'Popular products are not available yet.' }),
});
