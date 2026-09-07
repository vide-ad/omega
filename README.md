# Omega — training log with a coaching API

Single-user hypertrophy + endurance log: exercise library with fractional muscle credits, templates →
sessions → sets with one-tap RIR and pain flags, readiness log, injury constraints, mesocycles with volume
ramp + deload, a context-aware progression engine, weekly per-muscle volume vs targets, and an authenticated
REST API an LLM coach reads and writes.

```
packages/core   pure TypeScript: types, seed data, progression engine, volume accounting, API contract types
apps/api        Hono + node:sqlite REST API; also serves the built PWA
apps/web        installable offline-capable PWA (Vite + React + Dexie)
deploy/         Caddy, systemd, droplet setup + deploy scripts
docs/           PLAN, LANES, ORCHESTRATION, API, ENGINE-RULES, DEPLOY
```

Quick start: see `docs/DEPLOY.md` §4. Engine rulebook: `docs/ENGINE-RULES.md`. API: `docs/API.md`.
