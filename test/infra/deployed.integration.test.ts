import { describe, expect, it } from 'vitest';

const apiUrl = process.env.SEARCH_API_URL;
const knownProductId = '81d04927-ee96-4b17-82f4-83e9bee705a4';
const smokeQuery = 'warm weather training';
const testTimeoutMs = 30_000;
const queryParameter = 'q';
const deployed = apiUrl ? describe : describe.skip;

deployed('deployed search API', () => {
  it(
    'retrieves a semantic result and records one click',
    async () => {
      const searchResponse = await fetch(
        `${apiUrl}/search?${new URLSearchParams({ [queryParameter]: smokeQuery })}`,
      );

      expect(searchResponse.ok).toBe(true);
      const search = (await searchResponse.json()) as { items: Array<{ id: string }> };

      expect(search.items.some((item) => item.id === knownProductId)).toBe(true);

      const clickResponse = await fetch(`${apiUrl}/products/${knownProductId}/click`, {
        method: 'POST',
      });

      expect(clickResponse.ok).toBe(true);
      const click = (await clickResponse.json()) as { id: string; score: number };

      expect(click).toMatchObject({ id: knownProductId });
      expect(click.score).toBeGreaterThan(1);
    },
    testTimeoutMs,
  );
});
