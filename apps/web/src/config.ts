export function requireApiBaseUrl(value = import.meta.env.VITE_API_BASE_URL): string {
  const apiBaseUrl = value?.trim().replace(/\/$/, '');

  if (!apiBaseUrl) {
    throw new Error(
      'VITE_API_BASE_URL is required. Add the deployed API URL to apps/web/.env.local.',
    );
  }

  return apiBaseUrl;
}
