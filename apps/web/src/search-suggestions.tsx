import type { ProductSuggestion } from '@serverless-search/shared';
import type { ProductSearchState } from './use-product-search.js';
import { ProductSuggestion as ProductSuggestionItem } from './product-suggestion.js';

interface SearchSuggestionsProperties {
  activeIndex: number;
  state: ProductSearchState;
  onSelect: (item: ProductSuggestion) => void;
}

export function SearchSuggestions({
  activeIndex,
  state,
  onSelect,
}: SearchSuggestionsProperties): React.JSX.Element | null {
  if (state.status === 'idle') return null;

  return (
    <section aria-label="Product suggestions" className="search-suggestions">
      <p aria-live="polite" className="search-suggestions__status" role="status">
        {statusMessage(state)}
      </p>
      {state.status === 'ready' && state.items.length > 0 ? (
        <ul className="search-suggestions__list" id="product-suggestions" role="listbox">
          {state.items.map((item, index) => (
            <ProductSuggestionItem
              active={activeIndex === index}
              item={item}
              key={item.id}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function statusMessage(state: ProductSearchState): string {
  if (state.status === 'loading') return 'Loading suggestions.';
  if (state.status === 'error') return 'Suggestions could not be loaded. Try again.';
  if (state.items.length === 0) return 'No products found.';

  const label = state.mode === 'popular' ? 'popular products' : 'results';
  return `${state.items.length} ${label} available.`;
}
