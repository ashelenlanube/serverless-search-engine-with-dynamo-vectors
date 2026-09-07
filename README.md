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
npm run cdk:synth
```

## Deploy and seed

Deploy only after configuring AWS credentials in a Region with access to Titan Text Embeddings V2:

```bash
npm run cdk:deploy -- --context stage=dev
npm run seed
```

Deployment writes `cdk-outputs.json`, which the seed command reads for the generated table and vector-index names. Confirm catalog parsing without AWS calls with `npm run seed -- --dry-run`. Existing scores are retained by default; use `npm run seed -- --reset-scores` only for an intentional demo reset.

## Layout

- `packages/shared` — API schemas plus deterministic normalization and ranking logic.
- `data/products.json` — human-editable catalog; embeddings are deliberately not committed.
- `infra` — CDK stack, Lambda route placeholders, and the DynamoDB vector-index custom resource.
- `scripts/seed.ts` — validates, embeds, and idempotently writes the catalog.

The data file is validated by the seed command using `productInputSchema`. Every product receives a score of `1` only when it is first written to DynamoDB.
