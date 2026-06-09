# Verita Billing — Design Document

## Overview

Verita is a metered API billing system built as a single Next.js application with Postgres as the source of truth. The system ingests usage events, aggregates them into hourly windows, generates monthly invoices with tiered pricing, and exposes customer and ops interfaces.

The design prioritizes correctness over scale: duplicate events, concurrent workers, and replayed webhooks must not create duplicate financial effects.

## Data Model

### Core tables


| Table                             | Purpose                                             |
| --------------------------------- | --------------------------------------------------- |
| `customers`                       | Billing account; FK to `price_plans`                |
| `api_keys`                        | Hashed secrets with display prefix/last-four        |
| `price_plans` / `price_tiers`     | Tiered unit pricing                                 |
| `usage_events`                    | Immutable raw events; unique `request_id`           |
| `usage_windows`                   | Hourly aggregates per customer × api_key × endpoint |
| `invoices` / `invoice_line_items` | Monthly bills; amounts in integer cents             |
| `credits`                         | Ops-issued credits with idempotency key             |
| `webhook_events`                  | Payment webhook dedupe by `provider_event_id`       |
| `audit_logs`                      | Append-only ops action history                      |
| `job_states`                      | Worker watermarks and locks                         |


### Money representation

- Invoice totals and line items: **integer cents** (`amount_cents`).
- Per-unit rates: **micro-cents** (`unit_price_micro_cents`). One cent = 10,000 micro-cents, so $0.001/unit = 1,000 micro-cents.
- Line totals round with `Math.round(microCents / 10_000)` at line-item creation time.

### Key constraints

```sql
UNIQUE (usage_events.request_id)
UNIQUE (usage_windows.customer_id, api_key_id, endpoint, hour_start)
UNIQUE (invoices.customer_id, period_start, period_end)
UNIQUE (webhook_events.provider_event_id)
UNIQUE (credits.idempotency_key)
UNIQUE (audit_logs.idempotency_key) -- where set
```

Foreign keys enforce referential integrity. API keys store `key_hash` only; plaintext is shown once at creation.

### Indexes


| Index                                            | Serves                                    |
| ------------------------------------------------ | ----------------------------------------- |
| `usage_events(customer_id, occurred_at)`         | Customer usage queries, aggregation scans |
| `usage_events(api_key_id, occurred_at)`          | API-key filtered usage                    |
| `usage_events(occurred_at)`                      | Time-range aggregation                    |
| `usage_windows(customer_id, hour_start)`         | Customer dashboard rollups                |
| `invoices(customer_id, status)`                  | Invoice list                              |
| `audit_logs(entity_type, entity_id, created_at)` | Ops investigation                         |


### Scaling indexes (10× / 100×)

At **10×** (~50M events/month): partition `usage_events` by `occurred_at` month; add BRIN index on `occurred_at` for aggregation scans; consider partial index on unaggregated events if we track aggregation state per event.

At **100×** (~500M events/month): move to time-partitioned `usage_events` and `usage_windows`; archive raw events to cold storage after N days while keeping windows and invoices authoritative for billing.

## Idempotency & Concurrency

### Event ingestion (`POST /v1/events`)

Each event has a globally unique `request_id`. Ingestion uses `createMany({ skipDuplicates: true })` backed by a unique DB constraint. Concurrent duplicate inserts: one wins, others no-op. The API returns `{ accepted, duplicates }`.

### Aggregation worker

Before running, the worker checks `job_states` for an active lock (5-minute TTL). It recomputes windows for a lookback period (default: start of two months ago through now) from raw events and upserts by natural key. Running twice produces identical window totals. The wide default window ensures the previous billing month is covered in local/demo runs; at production scale we would shorten this with dirty-hour incremental aggregation.

**Trade-off:** Full recompute over a lookback window is simpler than incremental counters and self-heals drift, but becomes expensive at very high event volume.

### Invoice worker

Unique constraint on `(customer_id, period_start, period_end)` prevents duplicate monthly invoices. Job reruns skip customers that already have an invoice for the period.

### Payment webhook

`provider_event_id` is stored in `webhook_events` before mutating invoice state. Replayed webhooks return the existing result without double-marking paid. Signature verified with HMAC-SHA256 and `timingSafeEqual`.

### Ops credits and overrides

Both require client-supplied `idempotency_key`. Duplicate requests find the existing credit or audit row and return the prior result. Credits and overrides run inside Postgres transactions with audit log writes in the same transaction.

## Aggregation Pipeline

```text
usage_events (immutable)
    → hourly aggregation job
    → usage_windows (recomputable summaries)
    → monthly invoice job
    → invoice_line_items (issued snapshot)
    → invoices (status: ISSUED → PAID; ops credits may attach while ISSUED)
```

### State ownership


| Layer                | Mutable?           | Source of truth for            |
| -------------------- | ------------------ | ------------------------------ |
| `usage_events`       | Append-only        | Raw usage, idempotency         |
| `usage_windows`      | Upserted           | Dashboards, pre-invoice totals |
| `invoice_line_items` | Ops override only  | Billed amount                  |
| `invoices`           | Status transitions | Customer balance               |


### Late-arriving events

Events are stored by `occurred_at`, not `received_at`. The aggregator recomputes windows over a lookback window, so late events within that window update totals automatically.

**After invoice issuance:** we do not silently mutate issued/paid invoices. Late usage for a closed period would appear as a `CORRECTION` line item on the next invoice (schema supports `LineItemType.CORRECTION`; job not fully implemented in v1).

### Drift reconciliation

Window totals should equal `SUM(usage_events.units)` for the same dimensions and hour. The aggregator's recompute-from-raw approach prevents drift within the lookback window. For older periods, a manual reconciliation job would compare window sums to raw event sums and flag discrepancies.

## Failure Modes at Production Scale

Target: 5,000 customers, 200 events/sec sustained, 500M events/month.

### 1. Raw event table write throughput

**Breaks first** at sustained ingest without partitioning. Inserts are single-row with unique index on `request_id`.

**Fix:** Partition by month; batch inserts; optional write-behind queue before DB insert.

### 2. Aggregation lag

Recomputing a multi-day (or multi-month) lookback of raw events on each run becomes slow as event count grows.

**Fix:** Track per-hour dirty flags; incremental aggregation; dedicated worker pool.

### 3. Invoice job duration

Sequential per-customer invoice generation for 5,000 customers is manageable monthly but slow if run ad hoc.

**Fix:** Parallelize by customer shard; idempotent per-customer upsert already safe.

## Threat Model

### Hostile customer


| Attack                                 | Impact                  | Mitigation                                                                                            |
| -------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Guess another customer's invoice ID    | Read competitor billing | All `/v1` queries scoped by authenticated `customer_id` via `TenantScope`; 404 on cross-tenant access |
| Replay own events with new request_ids | Inflate usage           | Expected behavior; rate limits (not built) would be next step                                         |
| Steal API key from logs                | Impersonate customer    | Keys shown once; stored hashed; revoke support via `revoked_at`                                       |


### Hostile internal user


| Attack                           | Impact        | Mitigation                                                                                                 |
| -------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| Issue duplicate credits          | Double refund | Idempotency key + unique constraint                                                                        |
| Override line item without trace | Hidden fraud  | Immutable `audit_logs` with before/after                                                                   |
| Delete audit rows                | Cover tracks  | No delete path in application code; DB permissions should deny UPDATE/DELETE on `audit_logs` in production |


### Compromised webhook source


| Attack                                    | Impact                  | Mitigation                                 |
| ----------------------------------------- | ----------------------- | ------------------------------------------ |
| Forge payment events                      | Mark invoices paid      | HMAC signature verification                |
| Replay valid webhook                      | Double state change     | `webhook_events` dedupe table              |
| Replay with new event_id for same invoice | Re-trigger side effects | Invoice already PAID check before mutation |


## Trade-offs

### 1. Single Next.js app vs separate API server

**Chosen:** Next.js route handlers + shared `services/` layer (like ninja/layr repos).

**Rejected:** Fastify standalone backend + separate React SPA.

**Why:** Faster development, shared types, one deploy unit. Business logic lives in `services/` so extraction to a dedicated API later is straightforward. Fastify would add value at higher throughput or multi-client API needs.

### 2. Recompute windows vs incremental counters

**Chosen:** Recompute hourly windows from raw events over a lookback period.

**Rejected:** Incremental `+= units` on ingest.

**Why:** Incremental is faster but drifts on late events, duplicates, or bugs. Recompute is self-healing within the lookback window. At 500M events/month we would switch to dirty-hour incremental with periodic reconciliation.

## Operational Thinking

### Alerts

- Aggregation job lock held > 10 minutes
- Aggregation lag: newest `usage_event.received_at` minus newest `usage_window.updated_at` > 2 hours
- Invoice job failures
- Webhook signature failures spike
- Customer usage anomaly signals (10× baseline)

### Debugging a wrong invoice

1. Find invoice and line items in ops console.
2. Check `usage_windows` for the billing period.
3. Compare window totals to `SUM(usage_events)` for that customer/period.
4. Review `audit_logs` for overrides or credits.
5. Check for late events after invoice `issued_at`.

### Audit log immutability

Today, audit rows are append-only by convention: the application never exposes update or delete paths for `audit_logs`. Credit and line-item override services only call `auditLog.create` inside the same transaction as the financial change.

In production, we would harden this with database-level controls: revoke `UPDATE`/`DELETE` on `audit_logs` for the application role and add a `BEFORE UPDATE OR DELETE` trigger that raises an exception. That way a compromised app process or operator with SQL access cannot silently rewrite history. We would also ship audit rows to append-only object storage (S3 + Object Lock) for long-term retention and tamper evidence.

### Observability hooks

Beyond the alerts listed above, we would emit structured metrics per job run: `events_ingested`, `windows_upserted`, `invoices_created`, `webhook_replays`, and `credit_idempotency_hits`. Dashboards would correlate ingestion rate with aggregation lag. For on-call, a single “billing health” panel would show: oldest unaggregated event age, count of invoices in `ISSUED` > 7 days, and webhook signature failure rate.

## What We Did Not Build

- Full late-event correction pipeline on next invoice
- Postgres Row Level Security (tenant scoping is application-layer)
- Rate limiting and API key rotation UI
- Real payment processor integration (Stripe, etc.)
- Distributed job queue (BullMQ/Redis) — using simple locked `job_states` table
- Audit log DB-level immutability triggers (designed, not migrated)
- Production auth (OAuth, SSO for ops)

## Next Steps

1. Add DB trigger preventing `audit_logs` mutation
2. Implement correction line items for post-issuance late events
3. Add rate limiting on event ingestion
4. Move aggregation to dirty-hour incremental with reconciliation cron
5. Ship audit logs to immutable object storage

