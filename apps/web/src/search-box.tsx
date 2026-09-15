import type { ProductSuggestion } from '@serverless-search/shared';
import { useEffect, useRef, useState } from 'react';
import type { ProductApi } from './api.js';
import { SearchSuggestions } from './search-suggestions.js';
import { useProductSearch } from './use-product-search.js';

interface SearchBoxProperties {
  api: ProductApi;
}

const INITIAL_ACTIVE_INDEX = 0;

export function SearchBox({ api }: SearchBoxProperties): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(INITIAL_ACTIVE_INDEX);
  const [clickError, setClickError] = useState<string | null>(null);
  const clickInProgress = useRef(false);
  const state = useProductSearch({ api, query, isOpen });
  const activeItem = state.items[activeIndex];

  useEffect(() => {
    setActiveIndex(INITIAL_ACTIVE_INDEX);
  }, [query, state.items]);

  const selectProduct = (item: ProductSuggestion): void => {
    if (clickInProgress.current) return;

    clickInProgress.current = true;
    setClickError(null);
    setQuery(item.name);
    setIsOpen(false);

    void api
      .recordClick(item.id, { signal: new AbortController().signal })
      .catch(() => setClickError('The product was selected, but its popularity was not updated.'))
      .finally(() => {
        clickInProgress.current = false;
      });
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) =>
        Math.min(index + 1, Math.max(INITIAL_ACTIVE_INDEX, state.items.length - 1)),
      );
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(INITIAL_ACTIVE_INDEX, index - 1));
    }

    if (event.key === 'Enter' && activeItem && isOpen) {
      event.preventDefault();
      selectProduct(activeItem);
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };
  const activeOptionId = activeItem ? `product-option-${activeItem.id}` : undefined;
  const isExpanded = isOpen && state.status !== 'idle';

  return (
    <div className="search-box">
      <label className="search-box__label" htmlFor="product-search">
        Search products
      </label>
      <input
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        aria-controls="product-suggestions"
        aria-expanded={isExpanded}
        autoComplete="off"
        className="search-box__input"
        id="product-search"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Try “summer shoes”"
        role="combobox"
        type="search"
        value={query}
      />
      <SearchSuggestions activeIndex={activeIndex} onSelect={selectProduct} state={state} />
      {clickError ? <p role="alert">{clickError}</p> : null}
    </div>
  );
}
