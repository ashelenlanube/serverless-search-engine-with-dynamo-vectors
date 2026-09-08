import { normalizeText, type ProductSuggestion } from '@serverless-search/shared';
import { useEffect, useRef, useState } from 'react';
import type { ProductApi } from './api.js';
import { useDebouncedValue } from './use-debounced-value.js';

const MINIMUM_QUERY_LENGTH = 2;

export type SuggestionStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ProductSearchState {
  items: ProductSuggestion[];
  status: SuggestionStatus;
  mode: 'popular' | 'search' | null;
}

interface ProductSearchOptions {
  api: ProductApi;
  isOpen: boolean;
  query: string;
}

const EMPTY_STATE: ProductSearchState = { items: [], status: 'idle', mode: null };

export function useProductSearch({ api, query, isOpen }: ProductSearchOptions): ProductSearchState {
  const normalizedQuery = normalizeText(query);
  const debouncedQuery = useDebouncedValue(normalizedQuery);
  const requestNumber = useRef(0);
  const [state, setState] = useState<ProductSearchState>(EMPTY_STATE);

  useEffect(() => {
    const isEmptyQuery = normalizedQuery.length === 0;
    const isShortQuery = normalizedQuery.length < MINIMUM_QUERY_LENGTH;
    const isWaitingForDebounce = normalizedQuery !== debouncedQuery;
    const shouldFetch = isOpen && (isEmptyQuery || (!isShortQuery && !isWaitingForDebounce));
    const requestId = requestNumber.current + 1;
    requestNumber.current = requestId;

    if (!shouldFetch) {
      setState(EMPTY_STATE);
      return;
    }

    const controller = new AbortController();
    const mode = isEmptyQuery ? 'popular' : 'search';
    setState({ items: [], status: 'loading', mode });

    const request = isEmptyQuery
      ? api.getPopular({ signal: controller.signal })
      : api.search(normalizedQuery, { signal: controller.signal });

    void request
      .then((response) => {
        if (requestNumber.current !== requestId) return;
        setState({ items: response.items, status: 'ready', mode });
      })
      .catch(() => {
        if (controller.signal.aborted || requestNumber.current !== requestId) return;
        setState({ items: [], status: 'error', mode });
      });

    return () => controller.abort();
  }, [api, debouncedQuery, isOpen, normalizedQuery]);

  return state;
}
