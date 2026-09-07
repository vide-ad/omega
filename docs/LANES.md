# Lanes and ownership

Agent names for the channel (`BRIDGE_NAME`) must be unique across the whole workspace. Taken:
`corvus`, `cass`, `wren`, `lyra`, `tempo`. Suggested for the worker lanes, David's call — `swift`
(web/Mac), `kestrel` (api/PC back-end), `tern` (core/PC coder). Channel `#project-omega`,
`SLACK_BRIDGE_CHANNEL=C0C03JVQWSJ`. Setup and conventions: `docs/ORCHESTRATION.md`, full instructions
`docs/agent-bridge.md`.

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

## Open work from the design review

`docs/DESIGN-REVIEW.md` holds the reasoning; this is the assignment. Items 1–3 are the ones that change
behaviour rather than appearance, and 1 should land before any real training data accumulates.

### core
1. **The effort test.** Implement `docs/ENGINE-RULES.md` → *The effort test*: mean RIR for C3/C4 is computed over
   non-AMRAP units with **observed** RIR; no observed RIR among non-AMRAP units means C3 cannot fire and the
   prescription falls to `consolidate`; AMRAP-only exercises keep the existing allowance. Tests must cover the
   four-row table in the review doc, which is the verified current behaviour and must change for row 1 only.
2. Tighten `rir_observed` from optional to required once `api` and `web` both send it, and drop the
   absent-means-true fallback in the same PR.

### api
3. **`rir_observed` column and migration.** Existing rows with a non-null `rir` migrate to `true`. Accept the
   field on set create and patch, default `true` when omitted, and force `true` alongside `rir = 0` for AMRAP.
4. `DELETE /workouts/:id/exercises/:weid` — removing an exercise from a running session has no endpoint.

### web
5. **The three exercise-management flows David asked for.** All three already exist in the API and are tested;
   none is in the UI. A searchable library picker (use the seeded `aliases`), add-an-exercise mid-session, and
   editing a routine's exercise list. Pair with item 4 for removal.
6. **RIR honesty.** Send `rir_observed: false` unless the chip was touched. Render assumed as a dashed brass
   outline and chosen as a solid chalk fill, with the label naming which — "engine assumed 3" → "you said 2".
7. **Carry the uplift across.** `docs/mockup/omega-uplift.html` is the reference: one-owner colour contract,
   accordion session, visible volume band, neutral treatment for a partial week's under-target, two type
   families with mono reserved for measured quantities.
8. **Demote readiness.** Off the bottom nav; move "today was rough" onto the session screen as one tap. Keep the
   screen reachable, keep the endpoints.
9. **On-device gate before M1 is done.** Dark-only legibility on a sweaty screen in direct sun, and one real
   session logged with a pump between sets. Record the results in `apps/web/README.md`.
