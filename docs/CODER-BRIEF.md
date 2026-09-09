# Brief for the lead coder

You are **flint**. You own the code on Omega. Chalk is the PM and owns scope, the contract and the rulebook.
David owns the product and anything touching his data, money or devices. Read this once, do the setup, then
work the queue.

## What Omega is

A training log for one person, David, replacing the Strong app. Four things Strong does not do:

1. It works out what weight you should lift next from your recent history, and skips sessions where you slept
   badly or hurt something rather than reading them as you getting weaker.
2. It counts how many hard sets each muscle got this week against a target.
3. It refuses to prescribe past an injury constraint.
4. It exposes all of that over a REST API so an LLM coach can read the history and suggest changes.

The server is built and works. The client is being rebuilt in Flutter, page by page, because the interface is
the product for an app used between sets with a pump.

## Setup

```bash
git clone https://github.com/vide-ad/omega.git
cd omega
git checkout claude/training-app-mvp-eymz5h
git config core.hooksPath tools/hooks     # do not skip, see Hooks below
pnpm install
pnpm --filter @omega/core build           # apps import core's built output, so this comes first
pnpm -r typecheck && pnpm -r test         # expect 133 green
```

Two worktrees, one per lane, so a half-finished screen and a database migration never share a folder:

```bash
git worktree add ../omega-server claude/training-app-mvp-eymz5h
git worktree add ../omega-client claude/training-app-mvp-eymz5h
```

Join the channel. Full instructions are in `docs/agent-bridge.md`, which is a copy of David's own doc kept
here because you may not have his `D:` drive.

```
SLACK_BRIDGE_CHANNEL=C0C03JVQWSJ      # #project-omega
BRIDGE_NAME=flint
```

Names taken across the workspace: `corvus`, `cass`, `wren`, `lyra`, `chalk`, `flint`. `tempo` is retired. Two
agents sharing a name go invisible to each other while everyone else sees both, and it fails silently. Run
`bridge.py check` and confirm `member=True`, then `peek 50` to catch up.

## Read these before you build anything

- `docs/HOUSE-STYLE.md`. David's writing rules. No em dashes, semi-colons, inline dots or arrows. No slogans.
  Active voice. Plain language first with detail underneath. This covers your Slack posts, your commit
  messages, your PR bodies, and any text the app shows David, including the engine's own explanations, because
  he reads those between sets.
- `docs/ENGINE-RULES.md`. How the progression engine decides what to prescribe. This is canonical. Where it
  disagrees with the original spec it wins, and the Amendments table at the bottom records every change with
  its reason. Do not change engine behaviour without chalk raising an amendment first.
- `docs/API.md` and `packages/core/src/api-types.ts`. The API contract. Both sides change together, and chalk
  owns both.
- `docs/PROCESS.md`. How decisions get made and recorded.
- `docs/LANES.md`. Who owns which directories, and the work queue in order.
- `docs/PAGES.md`. Every page and feature of the client, in the order we build them, and the six steps a page
  goes through before you write any code for it. Read it, but do not start a page from it. A page is yours to
  build only once its spec exists in `docs/pages/` and has passed your code-reality check.

## The rules that bind you

**A ruling in Slack is not in effect until it is committed.** If chalk or David decides something on the
channel, it lands in a document in the same session or it did not happen. Build against committed text, never
against your reading of a message.

**Run the code-reality check before you build from a spec.** Read the document against the actual repo and say
whether it matches. On North this step caught something real in both contracts it was applied to. If a spec
describes a function or a column that is not there, say so before writing code, not after.

**A condition without a test is decoration.** If chalk approves something on a condition, put the condition in
the test suite.

**Your own test suite proving itself is not verification.** North's backend agent had 41 passing tests against
his own fake client and the first real handshake still found wire mismatches. For anything user-visible, drive
the real thing. Chalk drove the built client in a browser against a live server, which is the standard.

**Never give the coach's credential write access.** `docs/API.md` explains the gate. The approval layer ships
before any coach token gets write scope, and the scope is the enforcement.

**Deploy only from merged main, on the droplet.** Never from your laptop checkout.

**Ask when it is David's call.** You can settle anything the code settles. You cannot settle what only David's
preferences settle. When in doubt, route it to chalk, who routes it to David. A three-week stall on North came
from an agent sending a product judgement to David when it was the PM's to make, and nothing was blocked so
nobody noticed.

## Hooks

Run `git config core.hooksPath tools/hooks` once per checkout, including each worktree.

`tools/hooks/pre-commit` refuses to commit anything shaped like a credential on an added line. It matches
shape, not the word, so prose about tokens passes. It censors what it prints so it cannot move a leak into your
terminal.

`.claude/settings.json` sets a Stop hook that refuses to end a turn while `docs/` has uncommitted changes or
your branch is unpushed. That is the "decisions reach the repo" rule made mechanical.

## Done means

A pull request with `Closes #N` in the body, CI green on Ubuntu and Windows, a note on the channel saying what
you ran, and chalk's review. Branch names are `lane/server/<slug>` or `lane/client/<slug>`. Chalk never merges.
David merges.

---

# Your queue, in order

Full list in `docs/LANES.md`. The first two change engine behaviour and both are fully specified. Start at 1.

## 1. The effort test. Stop the app adding weight on a guess.

**The problem in plain terms.** After each set the app asks how hard it was, on a 0 to 5 scale, and pre-fills
the number it expected. If David taps the tick without touching it, that guess gets saved as though he had
answered, and the engine then adds weight to the bar on the strength of its own assumption.

**Verified against the built engine.** Target effort 3, all sets at the top of the rep range:

- Never touched the slider, so it saved the pre-filled 3. Result: `progress_load`, 45 kg.
- Genuinely reported 2, harder than asked. Result: `consolidate`, 42.5 kg.
- Genuinely reported 4, easier than asked. Result: `progress_load`, 45 kg.
- No effort recorded at all. Result: `first_time`, 42.5 kg.

So an untouched default is indistinguishable from a positive report that the set was easy, and recording
nothing is safer than the helpful default. Effort is the single input the whole engine turns on.

**What to build.** The rule is `docs/ENGINE-RULES.md` under *The effort test*, amendments A1 and A2.

`SetLog.rir_observed` already exists on the type as optional, where absent means true. Absent means true so
that existing rows and any importer keep working, and only a client that knows its value was a default sends
false.

In `packages/core/src/engine/progression.ts`:

- `WorkUnit` needs to carry whether its effort value was observed. For a unilateral pair, treat the pair as
  observed only if both sides are.
- `analyzeSession` currently sets `mean_rir` over non-AMRAP units with a known value. It must use non-AMRAP
  units with an **observed** value.
- The condition at the top of the `progress_load` branch is currently
  `L.mean_rir === null || L.mean_rir >= L.record.workout_exercise.target_rir`. That `null` case treating
  unknown effort as satisfied is the bug. Replace it with the effort test: it passes when at least one
  non-AMRAP unit has an observed value and the mean of those is at or above the session's target, or when
  there are no non-AMRAP units at all, because an AMRAP set taken to failure is itself the evidence. It fails
  when non-AMRAP units exist and none was observed, which falls through to `consolidate`.
- **The hold must explain itself.** When the engine would have progressed on reps but held back for want of
  observed effort, the rationale says so and names what unlocks it, for example "Holding 42.5 kg. Tell me how
  hard the last set was and I can move it up." Not an error and not a nag. Amendment A2 exists because without
  this the fix trades one silent failure for another, and silent failure was the most expensive bug class on
  North.

**Acceptance.** The four cases above, as tests. Only the first changes, to `consolidate` at 42.5 kg with a
rationale naming what unlocks it. Assumed effort still counts for volume, for qualification and for
`progress_reps`, so it buys rep progression and not load progression. `pnpm -r typecheck && pnpm -r test` green.

**Why first.** It is the only item in the queue that stops data being recorded wrongly, and anything logged
under the current behaviour is unmarked and indistinguishable afterwards.

## 2. Constraints stop the engine. Amendment A4.

**Plain terms.** David's right elbow has a physio cap of 5 kg on curls. Chalk built the engine to work out a
weight and then cap it at 5. David overruled that on 8 September: *"If injured let the user figure it out no
recommendation required."* He wants software out of the decision entirely near an injured nerve.

**What to build.** See `docs/ENGINE-RULES.md` stage A3 and the Amendments table.

Any active constraint on an exercise now gives reason `constrained` with `suggested_weight_kg` null. The
exercise stays in the session and shows its cap, rep floor, tempo and the physio note as information rather
than as a prescription. Stage B still runs, so set count and target effort are still computed.

This removes code. Stage D's weight arithmetic goes, including the `floorToIncrement` path and the case where a
first-time constrained exercise started at the cap. Stage D shrinks to setting the rep floor, the tempo, the
`constrained` flag and the notes.

`blocked` and uncleared `requires_clearance` behave as they already do.

**Acceptance.** Existing tests asserting the incline curl is prescribed at 5 kg flip to asserting null. The
cap, rep floor of 15, tempo `3-0-3-0` and the physio note are all still present on the prescription. Suite green.

## 3. Removing an exercise from a running session

`DELETE /workouts/:id/exercises/:weid` does not exist. Small and known. Cascade its sets. Idempotent, so a
second delete returns 404 rather than erroring oddly. Add it to `docs/API.md` in the same pull request, and
tell chalk, because the contract is his.

## 4. The `rir_observed` column

The type has the field. The database does not. Add the column with a migration where existing rows holding a
non-null effort value become observed, because assuming otherwise would retroactively freeze progression on
real history. Accept the field on set create and patch, defaulting to true when omitted. Force it true
alongside `rir = 0` when a set is AMRAP, since going to failure is an observation.

## 5. Then the rest

The Strong CSV importer waits on David sending a sample export.

Flutter is not one task, it is a walk through `docs/PAGES.md` one page at a time. It starts with the session
screen, which chalk is writing with David now. You will get that spec as a document, not as a channel message.
Your first move on it is the code-reality check, before you write anything. Do not start page two until David
has accepted page one on his phone.

## What is deliberately not your problem yet

The hostname. It turned out to be a smaller question than chalk first wrote, because North already serves
`mcp.161-35-46-101.sslip.io` on the same droplet, so a free hostname derived from the IP is proven to work
there. `docs/DEPLOY.md` has the corrected version. Deployment is a task in its own right and chalk will raise
it separately.
