import type { ProductSuggestion } from '@serverless-search/shared';

interface ProductSuggestionProperties {
  active: boolean;
  item: ProductSuggestion;
  onSelect: (item: ProductSuggestion) => void;
}

export function ProductSuggestion({
  active,
  item,
  onSelect,
}: ProductSuggestionProperties): React.JSX.Element {
  return (
    <li
      aria-selected={active}
      className="product-suggestion"
      id={`product-option-${item.id}`}
      onClick={() => onSelect(item)}
      onMouseDown={(event) => event.preventDefault()}
      role="option"
    >
      <span className="product-suggestion__name">{item.name}</span>
      <span className="product-suggestion__description">{item.description}</span>
      <span className="product-suggestion__meta">
        {item.category} · {item.score} {item.score === 1 ? 'click' : 'clicks'}
      </span>
    </li>
  );
}
