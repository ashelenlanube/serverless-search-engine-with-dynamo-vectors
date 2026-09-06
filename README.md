# Serverless Product Search with DynamoDB Vector Search

## Prerequisites

- Node.js 24 or newer
- npm 11 or newer

## Commands

```bash
npm install
npm run build
npm test
npm run lint
npm run format:check
```

## Layout

- `packages/shared` — API schemas plus deterministic normalization and ranking logic.
- `data/products.json` — human-editable catalog; embeddings are deliberately not committed.

The data file is validated by the future seed command using `productInputSchema`. Every product receives a score of `1` only when it is first written to DynamoDB.
