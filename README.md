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

## Run the frontend locally

The frontend is deliberately local-only. Deploy and seed the backend first, then copy
the `ApiUrl` stack output into a local environment file:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Set `VITE_API_BASE_URL` in `apps/web/.env.local` to the deployed API URL, then run:

```bash
npm run dev:web
```

Vite serves the app at `http://localhost:5173`. The frontend fails with a clear
configuration error in development if `VITE_API_BASE_URL` is absent. The local
environment file is ignored by Git.

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
