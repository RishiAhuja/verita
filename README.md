# Verita — Metered API Billing

A Next.js + Postgres system for usage metering, hourly aggregation, monthly invoicing, customer dashboards, and ops tooling.

## One-command setup (recommended for reviewers)

**Requires:** Docker Desktop (macOS/Windows) or Docker Engine (Linux), Node.js 22+, pnpm 10+ (script enables pnpm via corepack if missing).

```bash
git clone <repo-url>
cd verita
./setup.sh
```

This script will:

1. Copy `.env.example` → `.env` (if `.env` does not exist)
2. Run `pnpm install`
3. Start Docker Compose (`postgres`, `web`, `worker`)
4. Wait for Postgres, then migrate + seed the database
5. Run aggregation and invoice workers so invoices have real line items

When it finishes, open:

- **Customer UI:** http://localhost:3000/customer/usage — paste a `vrt_live_*` key from the seed output
- **Ops UI:** http://localhost:3000/console/customers — ops key `dev-ops-key-change-me`

Variants:

```bash
./setup.sh --dev    # Postgres in Docker only; then run `pnpm dev` locally
./setup.sh --test   # Full stack + run `pnpm test` at the end
./setup.sh --help
```

Stop containers:

```bash
pnpm docker:down
```

## Quick start (manual, local dev)

```bash
cp .env.example .env
pnpm install
pnpm docker:up          # starts Postgres
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm worker:aggregate
pnpm worker:invoice
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

- **Customer UI:** `/customer/usage` — paste API key from seed output
- **Ops UI:** `/console/customers` — ops key from `.env` (`OPS_API_KEY`)

## Docker Compose (full stack)

Start Postgres, web, and background worker:

```bash
cp .env.example .env
pnpm install
docker compose -f infrastructure/docker/docker-compose.yml up -d --build
```

Initialize the database (run from host while Postgres container is up):

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm worker:aggregate
pnpm worker:invoice
```

The `web` service is available at [http://localhost:3000](http://localhost:3000). The `worker` container re-runs aggregation and invoice jobs every 60 seconds.

Stop everything:

```bash
pnpm docker:down
```

### Compose services

| Service | Role |
|---------|------|
| `postgres` | Primary database |
| `web` | Next.js app (API + UI) |
| `worker` | Aggregation + invoice jobs |

Environment variables are loaded from `.env` for ops/webhook secrets. Database credentials are set in `docker-compose.yml` for the container network.

## Local credentials

From `pnpm db:seed` output:

- Customer API keys for `/v1/*` and the customer dashboard
- Ops API key from `.env`: `OPS_API_KEY`
- Webhook signing secret from `.env`: `WEBHOOK_SIGNING_SECRET`

Seed usage events are placed in the **previous calendar month** so `pnpm worker:invoice` produces invoices with real line items.

## Main commands

```bash
pnpm dev                 # Next.js app
pnpm worker:aggregate    # hourly usage aggregation
pnpm worker:invoice      # monthly invoice generation
pnpm db:seed             # seed customers, keys, and usage events
pnpm generate:events     # send live events to ingestion API
pnpm test                # unit + integration tests
pnpm docker:up           # postgres only (alias)
pnpm docker:down
```

## Testing

```bash
# Requires Postgres running and seeded data
pnpm db:seed
pnpm worker:aggregate
pnpm worker:invoice
pnpm test
```

Integration tests cover event idempotency, tenant isolation, and webhook replay deduplication.

## Architecture

- `app/` — Next.js pages and API route handlers
- `services/` — business logic (ingestion, billing, ops, webhooks)
- `packages/database/` — Prisma schema, migrations, seed
- `workers/` — scheduled background jobs
- `scripts/` — event generator and utilities

## API surface

Assignment-compliant paths (via rewrites):

- `POST /v1/events`
- `GET /v1/usage`
- `GET /v1/invoices`, `GET /v1/invoices/:id`
- `GET /ops/customers`, `GET /ops/customers/:id`
- `POST /ops/customers/:id/credits`
- `PATCH /ops/invoices/:invoiceId/line-items/:lineItemId`
- `POST /webhooks/payments`

## Payment webhook (manual test)

```bash
BODY='{"event_id":"pay-001","invoice_id":"INVOICE_UUID","status":"paid"}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "dev-webhook-secret-change-me" | awk '{print $2}')

curl -X POST http://localhost:3000/webhooks/payments \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: sha256=$SIG" \
  -d "$BODY"
```

## Notes

- API keys are stored hashed; plaintext keys are shown only once during seed.
- Money is stored as integer cents.
- Duplicate `request_id` ingestion is ignored via database uniqueness.
- Webhook and ops money-moving actions are idempotent.
- Ops UI lives at `/console/*`; assignment API paths use `/ops/*`.
