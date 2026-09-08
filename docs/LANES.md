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

The lead coder's onboarding, rules and first tasks are in `docs/CODER-BRIEF.md`. That is the document to hand
a new coder. This page stays the authoritative list of who owns what.

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

## Order of work

Wren's §8 order, with one item inserted at position 2 by David's ruling on P1. The effort test still goes
first, for wren's reason: it is the only item here that protects data from being recorded wrongly.

1. **The effort test, with the explanatory line.** See `docs/ENGINE-RULES.md`, amendments A1 and A2. About an
   hour and fully specified. The tests must reproduce the four-row table in `docs/DESIGN-REVIEW.md`, with only
   row 1 changing. **Nothing precedes this.** It is the only item here that stops data being recorded wrongly,
   and it matters from the moment the interim app is deployed. Server lane.
2. **Constraints stop the engine (amendment A4).** David reversed chalk's clamp on 8 September. Delete stage D's
   weight arithmetic. Any active constraint on an exercise now gives reason `constrained` with
   `suggested_weight_kg` null, and the exercise stays in the session showing its cap, rep floor, tempo and physio
   note as information. Stage B still runs. This removes code rather than adding it, including the
   `floorToIncrement` path and the case where a first-time constrained exercise started at the cap. Existing
   tests asserting a curl is prescribed at 5 kg flip to asserting null. Server lane.
3. `DELETE /workouts/:id/exercises/:weid`, small, known, missing. Server lane.
4. `rir_observed` column + migration (existing non-null `rir` → observed); accept on set writes; force true with
   `rir = 0` for AMRAP. Server lane.
5. Strong CSV importer as a CLI with `--units` and `--dry-run` — spec follows once David sends a sample. Server lane.
6. **Then Flutter, page by page**, starting with the session screen. Each page gets a spec in `docs/pages/` that
   has passed a code-reality check before it is build-ready. Client lane.
7. `pending_review` proposals — the gate on ever giving the coach write scope. Server lane, when David wants the
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
