import type { ProductSuggestion } from '@serverless-search/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductApi } from './api.js';
import { SearchBox } from './search-box.js';

const PRODUCT: ProductSuggestion = {
  id: 'b9ce668f-22e7-4d85-aed5-77eaaf2f85e3',
  name: 'Cloud Runner Shoes',
  description: 'Lightweight running shoes for warm-weather training.',
  category: 'footwear',
  score: 1,
  imageUrl: '/products/cloud-runner.webp',
};

const SECOND_PRODUCT: ProductSuggestion = {
  ...PRODUCT,
  id: 'dc8a0ab5-b818-46d7-b13a-25742bd6f721',
  name: 'Trail Walker Shoes',
};

function createApi(): ProductApi {
  return {
    getPopular: vi.fn().mockResolvedValue({ items: [PRODUCT] }),
    search: vi.fn().mockResolvedValue({ query: 'shoes', items: [PRODUCT] }),
    recordClick: vi.fn().mockResolvedValue({ id: PRODUCT.id, score: 2 }),
  };
}

describe('SearchBox', () => {
  afterEach(() => cleanup());

  it('loads popular products when an empty input receives focus', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<SearchBox api={api} />);

    await user.click(screen.getByRole('combobox'));

    expect(api.getPopular).toHaveBeenCalledOnce();
    expect(await screen.findByRole('option', { name: /cloud runner shoes/i })).toBeTruthy();
  });

  it('debounces a burst of typed search input', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<SearchBox api={api} />);

    await user.type(screen.getByRole('combobox'), 'shoes');

    await waitFor(() => expect(api.search).toHaveBeenCalledOnce(), { timeout: 1_000 });
    expect(api.search).toHaveBeenCalledWith('shoes', expect.anything());
  });

  it('aborts a stale request when the query changes', async () => {
    const api = createApi();
    const search = vi.fn().mockImplementation(
      (query: string, options: { signal: AbortSignal }) =>
        new Promise((resolve, reject) => {
          void query;
          void resolve;
          options.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    api.search = search;
    const user = userEvent.setup();
    render(<SearchBox api={api} />);

    await user.type(screen.getByRole('combobox'), 'shoes');
    await waitFor(() => expect(search).toHaveBeenCalledOnce(), { timeout: 1_000 });
    await user.type(screen.getByRole('combobox'), 'x');

    await waitFor(() => expect(search.mock.calls[0]?.[1].signal.aborted).toBe(true));
  });

  it('selects the active product with Enter and records one click', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<SearchBox api={api} />);

    await user.click(screen.getByRole('combobox'));
    await screen.findByRole('option');
    await user.keyboard('{Enter}');

    expect(api.recordClick).toHaveBeenCalledOnce();
  });

  it('moves through products with ArrowDown and ArrowUp', async () => {
    const api = createApi();
    vi.mocked(api.getPopular).mockResolvedValue({ items: [PRODUCT, SECOND_PRODUCT] });
    const user = userEvent.setup();
    render(<SearchBox api={api} />);
    const input = screen.getByRole('combobox');

    await user.click(input);
    const options = await screen.findAllByRole('option');
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');

    await user.keyboard('{ArrowDown}');
    expect(options[1]?.getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(`product-option-${SECOND_PRODUCT.id}`);

    await user.keyboard('{ArrowUp}');
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('closes the menu when Escape is pressed', async () => {
    const api = createApi();
    render(<SearchBox api={api} />);
    const input = screen.getByRole('combobox');

    fireEvent.focus(input);
    await screen.findByRole('option');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('option')).toBeNull();
  });
});
