# The client is Flutter. The PWA is a stopgap.

Decided 8 Sep by David. This supersedes the PWA-only reading in `docs/PLAN.md`.

## The decision

**Target client: a Flutter iOS app**, built page by page, with a lead coder/UX agent owning it.
**Interim client: the existing PWA**, deployed and used for real training while Flutter is built.
Both talk to the same API and the same database, so nothing logged in the interim is lost or migrated.

Cut over when Flutter is ready. There is no flag day and no data migration — it is the same server.

## Why

- **HealthKit.** Spec §3.5 puts Apple Health cardio import in v1. A PWA cannot read HealthKit at all; the
  best it manages is an Apple Shortcut posting to `POST /cardio`. Flutter reads it directly.
- **Fluency.** David and the team already build Flutter (North). The lead coder for Omega is a different
  agent — Cass stays on North.
- **The interface is the product here.** A training log lives or dies on how it feels between sets, with a
  pump, at arm's length. That earns page-by-page attention, which is how this will be built.

The cost being knowingly re-bought: Apple Developer enrolment, Xcode signing and TestFlight. North sat
blocked for weeks on *"Xcode has no Apple ID signed in"*. That friction is real and was the one thing the
PWA route avoided.

## What this does and does not change

**Unchanged — the whole server side.** Flutter is a client swap, not a rewrite.

| | Lines | Status |
|---|---|---|
| `apps/api` — 41 endpoints, auth, SQLite, migrations, seed | 3,810 | unchanged |
| `packages/core` — engine, volume accounting, seed data, contract types | 2,496 | unchanged |
| `docs/` — rulebook, API contract, design decisions | 966 | unchanged |
| `deploy/` — Caddy, systemd, droplet scripts | 112 | unchanged |
| core + api tests | 1,160 | stay green |
| `apps/web` — rebuilt in Dart | 3,400 | interim only |

**The engine is never ported to Dart.** `packages/core` is pure TypeScript with no I/O and runs server-side.
`POST /workouts` returns prescriptions already computed; the client renders them. The PWA works this way too.
So the Flutter app needs no engine, no seed data and no progression logic of its own — it needs a good HTTP
client and good screens.

**Offline stays a client concern.** Logging sets offline works through an outbox that replays with client-side
UUIDs; every create endpoint is idempotent on a supplied `id`. *Starting* a session needs the network, because
the prescription comes from the server. That constraint is the same for both clients.

## What the Flutter lane inherits

- `docs/API.md` — the contract, 41 endpoints, request and response shapes.
- `packages/core/src/api-types.ts` — the same contract as types, to mirror in Dart.
- `docs/ENGINE-RULES.md` — what the reason codes mean and why a prescription says what it says. The client
  never implements this, but it displays it, so it has to be understood.
- `docs/DESIGN-REVIEW.md` — accepted design decisions, including the one-owner colour contract and the RIR
  honesty requirement.
- `docs/mockup/omega-uplift.html` — the visual reference, and `omega-mockup.html` for comparison.
- The running PWA as a behavioural reference: whatever it does, the API supports.

## Carried forward, unresolved

- **The RIR fix is still unimplemented.** `progress_load` still fires on an untouched default. It is an engine
  change (`packages/core`), not a client one, and it should land before real training data accumulates —
  see `docs/ENGINE-RULES.md` → *The effort test*.
- **A hostname** is still the only thing blocking deployment, and is needed for either client.
