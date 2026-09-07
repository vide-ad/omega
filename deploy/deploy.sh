#!/usr/bin/env bash
# Deploy the current main branch on the droplet. Idempotent. Run as root or omega.
set -euo pipefail
cd /srv/omega
git fetch origin main && git checkout -q main && git reset -q --hard origin/main
pnpm install --frozen-lockfile
pnpm --filter @omega/core build
pnpm --filter @omega/api build
pnpm --filter @omega/web build
set -a; . /etc/omega/env; set +a
(cd apps/api && node --no-warnings=ExperimentalWarning dist/cli/migrate.js)
# Seed is idempotent; pass --start=YYYY-MM-DD (a Saturday) the first time to anchor the mesocycle.
(cd apps/api && node --no-warnings=ExperimentalWarning dist/cli/seed.js "$@")
systemctl restart omega-api
sleep 1
curl -fsS http://127.0.0.1:8787/api/health && echo " deployed"
