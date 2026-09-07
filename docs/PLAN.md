# Omega — project plan

**PM:** Chalk (Claude, cloud session). **Goal:** a phone-usable training log that replaces Strong, with an
LLM-coach API, in real use for one full mesocycle before anything fancier.

## Status against the spec's build order (§10)

| # | Step | State | Where |
|---|---|---|---|
| 1 | Schema + exercise library + credits + seed | **done** (core), API schema in progress | `packages/core/src/{types,seed}` |
| 2 | Templates → sessions → set logging + rest timer | **done**, verified end to end | `apps/api`, `apps/web` |
| 3 | Readiness log + pain flags | **done** | `apps/api/src/routes/readiness.ts`, `apps/web/src/screens/Readiness.tsx` |
| 4 | Volume accounting + dashboard | **done** | `packages/core/src/engine/volume.ts`, `apps/web/src/screens/Volume.tsx` |
| 5 | Progression engine | **done**, audited, 51 tests | `packages/core/src/engine/progression.ts`, `docs/ENGINE-RULES.md` |
| 6 | API + auth | **done** (two tokens; coach proposals deferred to M3) | `apps/api`, `docs/API.md` |
| 7 | Cardio import | manual `POST /cardio` in MVP; Shortcuts recipe is an api-lane issue | |
| 8 | Pose metrics | schema reserved only (`MediaAsset`, `PoseMetrics`, tables created) | |

## Milestones

- **M0 — foundation (this session):** monorepo, core types/seed/engine, contract, CI, deploy files, docs. ✔
- **M1 — on the phone:** API + PWA verified end to end in the sandbox ✔ (129 tests; live server drives seed → session →
  sets → completion → volume → week 2, and serves the installable PWA). Remaining: deploy to the droplet under HTTPS,
  install on the iPhone, log one real session. *Blocked on: hostname + droplet access (api lane), iPhone check (web lane).*
- **M2 — replaces Strong:** readiness form in daily use, volume dashboard, coach reading `/summary`, backups.
- **M3 — coach loop:** proposals (pending_review) with in-app accept/reject, `/prescriptions/preview`, Apple Health cardio import.
- **M4 — one full mesocycle in real use**, then decide on pose metrics.

## Decisions made (and why)

- **PWA, not native.** Fastest to the phone, no App Store, works offline with IndexedDB; iOS 26 makes install trivial.
  HealthKit is unreachable from the web, so cardio import is via an Apple Shortcut posting to the API. Revisit Expo only
  if direct HealthKit or locked-screen alerts become hard requirements after a mesocycle.
- **Server SQLite is the durable truth; the phone is an offline-capable client with an outbox.** The spec's "local-first
  with the API over it" cannot serve the coach while the phone is off. Single user, single device ⇒ no sync engine.
- **Built-in `node:sqlite`, no ORM.** Zero native modules, so the Windows agent never fights node-gyp. Node 24 on the droplet.
- **Two tokens for MVP** (write = phone, read = coach). Coach *writes* become proposals in M3; until then the coach is read-only.
- **Engine follows `docs/ENGINE-RULES.md`,** which resolves the spec's contradictions (see the deviations table there).
- **Mesocycle weeks and volume weeks are 7-day blocks from the block's start (a Saturday),** so Sat/Sun/Wed stay in one week.

## Open questions for the user

1. Channel name for Omega and who creates it (`bridge.py create <name>` also wires the bot). Resolved: agent-bridge
   is David's own `D:\Coding\bridge.py`; see `docs/ORCHESTRATION.md` for how each lane reaches it and why chalk
   uses the Claude Slack connector instead.
2. Hostname for the droplet (buy a domain vs DuckDNS). Needed before the iPhone install.
3. Apple Watch? Decides the free Shortcuts path for cardio import.
4. Seed volume: keep the spec's `set_delta 0,1,2,3,3` on every priority slot (quads ≈ 32 sets by week 4) or tune?
5. "Preacher Curl" and "Machine Curl": same machine? Bayesian curl is standing vs the "seated only" rehab note.
