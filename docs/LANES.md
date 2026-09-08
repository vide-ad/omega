# Lanes and ownership

Wren's ruling, 8 Sep: **one coder, two lanes, worktrees, and a named trigger for splitting.**

Two agents coordinating over a day of finite backend work is the trade that loses — multi-agent setups cost
3–10× the tokens and degrade sequential work. The August clobbering on North was two agents in one working copy,
which worktrees solve; it is not an argument for lane separation.

## Who

| Role | Agent | Route to the channel |
|---|---|---|
| PM — scope, contract, rulebook, review | **chalk** (cloud) | Claude Slack connector, posts as `[chalk]` |
| Lead coder / UX — holds **both** lanes below today | *to be named by David* (not cass, who stays on North) | `bridge.py`, unique `BRIDGE_NAME` |

Channel `#project-omega`, `SLACK_BRIDGE_CHANNEL=C0C03JVQWSJ`. Full setup in `docs/agent-bridge.md`.
Names taken across the workspace: `corvus`, `cass`, `wren`, `lyra`, `chalk`; `tempo` retired.

## The two lanes

| Lane | Owns | One worktree each |
|---|---|---|
| **client** | `apps/flutter/**` (to be created), and `apps/web/**` while the PWA is the interim | `../omega-client` |
| **server** | `apps/api/**`, `packages/core/**`, `deploy/**`, the droplet | `../omega-server` |

`docs/**`, `packages/core/src/api-types.ts`, `docs/API.md` and `docs/ENGINE-RULES.md` are chalk's. A change to
the contract or the rulebook is a numbered amendment (see the Amendments table in `ENGINE-RULES.md`), proposed on
the channel, ruled on, committed by chalk, and only then built against. Never against the Slack message.

One coder holding both lanes still uses two worktrees. That is what stops a half-finished screen and a migration
sharing a working copy.

## When to split

**Video intake for form review.** It is a genuinely separate context — upload, storage, transcoding, inference,
a client handling latency it does not control, and video of a person's body with real retention and access
questions. Clean API seam by nature. Split the server lane there, and not before. Details in `docs/PLAN.md` M5.

## Order of work — wren's §8, unchanged

1. **The RIR effort test, with the explanatory line.** `docs/ENGINE-RULES.md` → *The effort test* and amendments
   A1–A2. About an hour, fully specified, tests must reproduce the four-row table in `docs/DESIGN-REVIEW.md` with
   only row 1 changing. **Nothing precedes this** — it protects data that starts accumulating the moment the PWA
   is deployed. Server lane.
2. `DELETE /workouts/:id/exercises/:weid` — small, known, missing. Server lane.
3. `rir_observed` column + migration (existing non-null `rir` → observed); accept on set writes; force true with
   `rir = 0` for AMRAP. Server lane.
4. Strong CSV importer as a CLI with `--units` and `--dry-run` — spec follows once David sends a sample. Server lane.
5. **Then Flutter, page by page**, starting with the session screen. Each page gets a spec in `docs/pages/` that
   has passed a code-reality check before it is build-ready. Client lane.
6. `pending_review` proposals — the gate on ever giving the coach write scope. Server lane, when David wants the
   coach writing.

## Carried from the design review

- Client: the three exercise-management flows (library, add mid-session, edit routine) — the API already does
  all three; send `rir_observed: false` unless the chip was touched and render assumed vs chosen differently;
  carry across the uplift (`docs/mockup/omega-uplift.html`); demote readiness to a session-screen toggle; the
  on-device gate — dark-only in direct sun, one real session with a pump — before M1 is called done.
- Server: items 1–3 above.

## Branch and PR conventions

- Branch: `lane/<client|server>/<issue>-<slug>`; base `main`; squash-merge; CI green required.
- PR template: `.github/pull_request_template.md`.
- Commits: imperative subject, body lists behaviour changes. No model names in commits or code.
- `git config core.hooksPath tools/hooks` in every checkout — the secrets hook lives there.
- Line endings are LF via `.gitattributes`.
