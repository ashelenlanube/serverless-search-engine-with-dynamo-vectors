import { z } from 'zod';

const PRODUCT_NAME_MAX_LENGTH = 160;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 2_000;
const PRODUCT_CATEGORY_MAX_LENGTH = 80;
const PRODUCT_TAG_MAX_LENGTH = 60;
const PRODUCT_TAGS_MAX_COUNT = 20;
const PRODUCT_IMAGE_URL_MAX_LENGTH = 2_048;
const RESPONSE_MAX_ITEMS = 5;
const SEARCH_QUERY_MIN_LENGTH = 2;
const SEARCH_QUERY_MAX_LENGTH = 100;

export const productIdSchema = z.string().uuid();

export const productInputSchema = z
  .object({
    id: productIdSchema,
    name: z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH),
    description: z.string().trim().min(1).max(PRODUCT_DESCRIPTION_MAX_LENGTH),
    category: z.string().trim().min(1).max(PRODUCT_CATEGORY_MAX_LENGTH),
    tags: z
      .array(z.string().trim().min(1).max(PRODUCT_TAG_MAX_LENGTH))
      .min(1)
      .max(PRODUCT_TAGS_MAX_COUNT),
    imageUrl: z.string().trim().min(1).max(PRODUCT_IMAGE_URL_MAX_LENGTH).optional(),
  })
  .strict();

export const productSchema = productInputSchema.extend({
  score: z.number().int().min(0),
});

export const productSuggestionSchema = productSchema.pick({
  id: true,
  name: true,
  description: true,
  category: true,
  imageUrl: true,
  score: true,
});

export const matchSchema = z.object({
  kind: z.enum(['hybrid', 'lexical']),
  rankingScore: z.number().min(0).max(1),
});

export const searchSuggestionSchema = productSuggestionSchema.extend({
  match: matchSchema,
});

export const popularResponseSchema = z.object({
  items: z.array(productSuggestionSchema).max(RESPONSE_MAX_ITEMS),
});

export const searchResponseSchema = z.object({
  query: z.string().min(SEARCH_QUERY_MIN_LENGTH).max(SEARCH_QUERY_MAX_LENGTH),
  items: z.array(searchSuggestionSchema).max(RESPONSE_MAX_ITEMS),
});

export const clickResponseSchema = z.object({
  id: productIdSchema,
  score: z.number().int().min(1),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type Product = z.infer<typeof productSchema>;
export type ProductSuggestion = z.infer<typeof productSuggestionSchema>;
export type SearchSuggestion = z.infer<typeof searchSuggestionSchema>;
export type PopularResponse = z.infer<typeof popularResponseSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type ClickResponse = z.infer<typeof clickResponseSchema>;
