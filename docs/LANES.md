# Lanes and ownership

Agent names for the channel (`BRIDGE_NAME`), matching the `#project-north` convention of one lowercase word:
`tempo` (PM), and for the three worker lanes pick names when the agents are started — suggested `pacer` (web/Mac),
`anvil` (api/PC back-end) and `metronome` (core/PC coder). Post as `[name]`; see `docs/ORCHESTRATION.md`.

| Lane | Machine | Owns (write access) | Never touches |
|---|---|---|---|
| **pm** (Tempo) | cloud | `docs/**`, `packages/core/src/api-types.ts`, `docs/API.md`, `docs/ENGINE-RULES.md`, `.github/**`, root configs | app internals |
| **web** | Mac | `apps/web/**` | `apps/api`, `packages/core` (except via a pm issue) |
| **api** | PC (back-end) | `apps/api/**`, `deploy/**`, the droplet | `apps/web`, engine semantics in `packages/core` |
| **core** | PC (coder), own git worktree | `packages/core/**` (engine hardening, seeds, golden scenarios), `apps/api/test/contract/**` | route implementations, screens |

Why by package rather than by machine: only the Mac can test Safari/iOS, so the PWA lives there. Everything
else is OS-neutral TypeScript and is split so the two Windows agents never edit the same directory.

## First issues per lane (in priority order)

### web (Mac)
1. **On-device gate**: install the PWA on the iPhone from the droplet URL; verify install, offline start, IndexedDB persistence after a cold start, wake lock during a session, timer accuracy after screen lock, Web Audio beep with the mute switch on. Record results in `apps/web/README.md`.
2. **Session screen polish from real use**: one-handed reach, keyboard behaviour on weight/reps inputs, chip sizes, previous-numbers legibility.
3. **Outbox robustness**: retry backoff, 4xx parking with a visible reason, "resend all" in Settings; hydrate the cache from `/templates`, `/mesocycles/current`, `/volume` on first launch.
4. **Readiness form ≤ 20 s** stopwatch-tested; soreness chips from `recently_trained`.
5. **Proposals sheet** (after api lane ships `/proposals`): list, diff summary, accept/reject.

### api (PC back-end)
1. **Droplet live today**: `deploy/droplet-setup.sh`, Caddy with the chosen hostname (HTTPS is mandatory for an installed PWA), systemd unit, `deploy/deploy.sh`. Prove `https://<host>/api/health` from the phone and the PWA installs.
2. **Backups**: nightly `sqlite3 .backup` via systemd timer to `/var/backups/omega`, plus a restore drill written in `docs/DEPLOY.md`.
3. **Coach proposals** (`proposals` table, `POST` coaching writes from a `COACH` token → 202 + proposal, `POST /proposals/:id/accept|reject`), three tokens (`APP`, `COACH`, `READ`).
4. **`GET /prescriptions/preview?template_id=&date=`** (read scope) so the coach can see a would-be prescription.
5. **Apple Health cardio**: `POST /cardio` accepting the Shortcuts payload (upsert by start/end), documented recipe.

### core (PC coder)
1. **Golden scenarios**: `packages/core/src/engine/scenarios/*.json` + table-driven runner, one per reason and per audit trap (own-target evaluation after a template edit, M≠L repeat, regress before progress_reps, two misses with a non-qualifying session between, AMRAP handling, increment-0, clamp keeps underlying reason, cleared constraint still capped, deload 3→2 and 4→2, regress on 10 kg with 2 kg increment → 8).
2. **Mesocycle simulator**: deterministic lifter model played through the 6-week seed via `prescribe` → synthetic sets → completion → next prescription; invariants (never above a cap, chin-up never gets a weight while uncleared, stalls never double-increment, deload never progresses).
3. **API contract tests** in `apps/api/test/contract/**` written from `api-types.ts` (auth matrix, idempotent replay, AMRAP forces RIR 0, side validation, summary shape) — the api lane makes them green.
4. **Seed feasibility asserts** in `seed.test.ts` (week-1 and week-5 volume per muscle) so the volume caveats in `docs/ENGINE-RULES.md` are numbers, not prose.
5. **`docs/COACH.md`**: the system prompt for the LLM coach (hit `/summary` first, then `/progression/:id` for anything flagged, propose via coaching writes, never assume acceptance) and `scripts/coach-smoke.sh`.

## Handover rules between lanes

- Contract changes (`packages/core/src/api-types.ts`, `docs/API.md`) and engine semantics
  (`docs/ENGINE-RULES.md`) are `lane:pm`. Propose on the channel, tempo rules, tempo commits, then both sides
  build against the committed text — never against the Slack message.
- The core lane writes `apps/api/test/contract/**`; the api lane makes those tests green. Neither edits the
  other's half.
- Anything touching the droplet, DNS, tokens or backups is the api lane's, and needs David's say first.

## Branch and PR conventions

- Branch: `lane/<lane>/<issue>-<slug>`; base `main`; squash-merge.
- PR template: `.github/pull_request_template.md` (lane, issue, what was run).
- Commits: imperative subject, body lists behaviour changes. No model names in commits or code.
- Line endings are LF via `.gitattributes`; Windows agents must not commit CRLF.
