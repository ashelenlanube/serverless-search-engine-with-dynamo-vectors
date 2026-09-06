import { z } from 'zod';

export const productIdSchema = z.string().uuid();

export const productInputSchema = z
  .object({
    id: productIdSchema,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(2_000),
    category: z.string().trim().min(1).max(80),
    tags: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
    imageUrl: z.string().trim().min(1).max(2_048).optional(),
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
  items: z.array(productSuggestionSchema).max(5),
});

export const searchResponseSchema = z.object({
  query: z.string().min(2).max(100),
  items: z.array(searchSuggestionSchema).max(5),
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
