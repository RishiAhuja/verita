#!/usr/bin/env bash
# Verita one-command setup (macOS, Linux, WSL)
#
# Usage:
#   ./setup.sh              # Full stack: postgres + web + worker (Docker)
#   ./setup.sh --dev        # Postgres only + local Next.js (run `pnpm dev` after)
#   ./setup.sh --test       # Full stack + run integration tests at the end
#   ./setup.sh --help

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infrastructure/docker/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"

MODE="full"
RUN_TESTS=false

usage() {
  cat <<'EOF'
Verita setup

  ./setup.sh              Start full Docker stack (postgres, web, worker), migrate, seed, aggregate, invoice
  ./setup.sh --dev        Start Postgres only; you run `pnpm dev` locally afterward
  ./setup.sh --test       Same as default, then run `pnpm test`
  ./setup.sh --help       Show this message

Requires: Docker Desktop (or Docker Engine), Node.js 22+, pnpm 10+

After setup:
  App:        http://localhost:3000
  Customer:   http://localhost:3000/customer/usage   (paste API key from seed output below)
  Ops:        http://localhost:3000/console/customers (key: dev-ops-key-change-me)
EOF
}

log() {
  printf '\n==> %s\n' "$1"
}

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

node_major_version() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "0"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return
  fi

  log "pnpm not found — enabling via corepack"
  require_cmd corepack
  corepack enable
  corepack prepare pnpm@10.27.0 --activate
}

wait_for_postgres() {
  log "Waiting for Postgres to accept connections"
  local attempts=0
  local max_attempts=60

  until docker exec verita-postgres pg_isready -U postgres -d verita_dev >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ $attempts -ge $max_attempts ]]; then
      die "Postgres did not become ready within ${max_attempts}s. Run: docker logs verita-postgres"
    fi
    sleep 1
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      MODE="dev"
      shift
      ;;
    --test)
      RUN_TESTS=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1 (try --help)"
      ;;
  esac
done

cd "$ROOT_DIR"

log "Checking prerequisites"
require_cmd docker
require_cmd node
docker compose version >/dev/null 2>&1 || die "docker compose is not available"

NODE_MAJOR="$(node_major_version)"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  die "Node.js 22+ required (found v$(node -v)). Install from https://nodejs.org or use nvm."
fi

ensure_pnpm

if [[ ! -f "$ENV_FILE" ]]; then
  log "Creating .env from .env.example"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
else
  log ".env already exists — leaving it unchanged"
fi

log "Installing dependencies (pnpm install)"
pnpm install

if [[ "$MODE" == "dev" ]]; then
  log "Starting Postgres container only"
  docker compose -f "$COMPOSE_FILE" up -d postgres
else
  log "Building and starting full Docker stack (postgres, web, worker)"
  docker compose -f "$COMPOSE_FILE" up -d --build
fi

wait_for_postgres

log "Generating Prisma client"
pnpm db:generate

log "Running database migrations"
pnpm db:migrate

log "Seeding database (save the API keys printed below)"
pnpm db:seed

log "Running usage aggregation worker"
pnpm worker:aggregate

log "Running invoice generation worker"
pnpm worker:invoice

if [[ "$RUN_TESTS" == true ]]; then
  log "Running tests"
  pnpm test
fi

cat <<EOF

Setup complete.

URLs
  App:              http://localhost:3000
  Customer usage:   http://localhost:3000/customer/usage
  Customer invoices http://localhost:3000/customer/invoices
  Ops console:      http://localhost:3000/console/customers

Credentials (from .env)
  Ops API key:           dev-ops-key-change-me
  Webhook signing secret dev-webhook-secret-change-me

Customer API keys
  Copy the vrt_live_* keys printed by db:seed above into the customer dashboard.

EOF

if [[ "$MODE" == "dev" ]]; then
  cat <<'EOF'
Dev mode: Postgres is running in Docker. Start the app locally:

  pnpm dev

Workers are not running in a container — re-run after new seed data:

  pnpm worker:aggregate && pnpm worker:invoice

EOF
else
  cat <<'EOF'
Full stack mode: web and worker containers are running.
The worker re-runs aggregation + invoicing every 60 seconds.

Useful commands:

  docker compose -f infrastructure/docker/docker-compose.yml logs -f web
  docker compose -f infrastructure/docker/docker-compose.yml logs -f worker
  pnpm docker:down

EOF
fi

if [[ "$RUN_TESTS" == false ]]; then
  cat <<'EOF'
Optional — run integration tests:

  pnpm test

EOF
fi
