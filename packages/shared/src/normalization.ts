const combiningMarks = /\p{M}/gu;
const punctuationOrSymbols = /[^\p{L}\p{N}\s]/gu;
const whitespace = /\s+/gu;

/** Produces the stable comparison and embedding text form defined by the project plan. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(combiningMarks, '')
    .toLowerCase()
    .replace(punctuationOrSymbols, ' ')
    .replace(whitespace, ' ')
    .trim();
}

export function nameInitial(normalizedName: string): string {
  return normalizedName.slice(0, 1);
}

export function tokenizeNormalizedText(normalizedText: string): string[] {
  return normalizedText ? normalizedText.split(' ') : [];
}

export function productEmbeddingInput(product: {
  name: string;
  category: string;
  description: string;
  tags: readonly string[];
}): string {
  return [
    `Name: ${product.name}`,
    `Category: ${product.category}`,
    `Description: ${product.description}`,
    `Tags: ${product.tags.join(', ')}`,
  ].join('\n');
}
