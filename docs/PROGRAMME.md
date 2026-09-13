# How a programme gets into Omega

**PARKED by David on 12 September 2026. Do not build against this page.** He knows what he wants and is
still working out how it should sit in a database. Nothing on this page is decided, including chalk's
recommendation below, and nobody should treat it as a spec until he unparks it.

**Chalk's proposed engineering answer is at the bottom of this page, written 13 September at David's
request. It is a proposal awaiting his yes, not a decision. It was reviewed by GPT Astra on 13 September
and revised as a result. Read the revision, not the original proposal above it.**

**Parking it blocks nothing.** Flint's queue (issues 9, 11, 12 and the Strong importer) does not touch it.
Amendment A6, prescribed ramps, is safe to build because it changes what a template can express and that
is true wherever templates come from. Pages 1, 2 and 3 render whatever a programme produces and do not
care how it was authored. The only thing this holds up is coach write access, which was gated anyway.

## Sequencing, ruled by David on 12 September

**The deep research into training science happens after the app works, not before.** Chalk recommended
doing it first, on the grounds that every number in the engine is currently an unvalidated assumption.
David overruled that, and he is right.

His argument. What the app *captures* is settled and not worth researching: which exercise, how many sets,
how many reps, how many reps left in the tank, whether it went to failure, whether it hurt, whether it was
a warmup. Progressive overload as the governing principle is settled too. The research only changes what a
*coach* concludes from that record, and the coach is layer four. He also has direct experience of losing
months to research-first on North, which is a better reason than any argument from first principles.

Two things chalk would add, neither of which changes the ruling.

The engine's rules degrade gracefully, which is why deferring is safe. If it suggests 55 kg and David
thinks 57.5, he logs 57.5 and the next prescription follows what he actually lifted. A wrong rule costs
him one correction, not a training block. The one exception is the deload, which is structural: the app
deloads because it is week 6 rather than because his performance says so, and a wrong deload costs a whole
week. If that bites, making the calendar deload advisory is a small change.

And the ordering actively improves the research. Every session logged between now and then is effort
annotated, which nine years of Strong history is not. Research run after three months of real use has
something to work against. Research run now would have the same effort-free data chalk already analysed.

So the research keeps the brief David gave it, and waits: what does the evidence say about when to deload,
how to progress effort, and how to return from a break.

---

David set this out on 12 September 2026, and it reframes what the app is for. Recording it because the
original spec described a training log with a progression engine bolted on, and that is not the product.

## What he actually said

> the point of this app is to have (i) a deep research of training research (ii) an ai come up with a
> program based off personal preferences; (iii) feeds into the app

And then, for the layers underneath:

> a md file with (i) each exercise that the person has picked based off (ii) above for that session;
> (ii) a tracker (maybe a straight database is better) for each sessions; (iii) deterministic logic for
> progressive overload; (iv) overriden by further AI coach reviews of the md file + the database

## The four layers

1. **The programme.** A markdown file naming the exercises for each session, and why each one is there.
   Written by an AI working from training research and David's preferences. Human readable, because he
   reads it, and AI editable, because the coach revises it.
2. **The record.** Every set, every session, stored so it can be queried and charted.
3. **Progressive overload.** Deterministic logic, the same input giving the same answer every time. Not a
   model deciding what to put on the bar.
4. **Coach review.** An AI reads the programme file and the record together, and can override the
   programme. Not the individual load decisions, the programme.

Layer 3 stays deterministic on purpose. A model that improvises the weight on the bar cannot be tested,
cannot be explained after the fact, and cannot be trusted near an injury. The engine decides loads. The
coach decides programmes. That line is the architecture.

## What already exists

Three of the four are built and tested.

- **The record** is `apps/api` over SQLite, with every endpoint in `docs/API.md`.
- **Progressive overload** is `packages/core/src/engine/progression.ts`, governed by `docs/ENGINE-RULES.md`.
  It is a pure function, and its whole behaviour is a documented procedure with numbered amendments.
- **Coach review, the reading half**, is the REST API. `GET /summary` and `GET /progression/:exercise_id`
  exist so a coach can read the record without a human pasting anything.

## What does not exist

- **The programme as a markdown file.** Today a programme lives in the `workout_templates` and
  `template_exercises` tables, seeded from `packages/core/src/seed/templates.ts`. There is no file anyone
  would want to read, and nothing for an AI to revise.
- **Coach write access.** The gate in `docs/API.md` still stands. No coach credential gets write scope
  until the `pending_review` proposal layer ships, and the token scope is the enforcement rather than a
  promise. Layer 4 is exactly the thing that gate was built for, so it moves from "someday" to "needed".
- **Prescribed ramps.** See amendment A6 in `docs/ENGINE-RULES.md`.

## The open decision: is the markdown file the source of truth, or the authoring surface

Chalk's recommendation is **authoring surface**, and it is David's call.

The programme file is what the coach writes and David reads. A command compiles it into the template rows
the app runs on, validating as it goes. The database stays the runtime.

The reason is failure mode rather than elegance. If the file is parsed live, one malformed line breaks a
session while he is standing in the gym holding a loaded bar. If it compiles ahead of time, a bad edit
fails at compile with a message, and the last good programme keeps running. It also keeps the record
honest, because a session is instantiated from validated rows rather than from prose that may have changed
since.

The cost is that the file and the tables can drift, so the compile has to be the only way in, and hand
edits to the template tables have to stop.

## Open questions for David

1. **Who writes the first programme file?** The seeded three-day split came from his spec. Does it get
   transcribed into the file format, or does the research-and-design pass produce a fresh one?
2. **How much does the coach get to change without him?** Swapping one exercise for another is a different
   size of decision from rewriting a whole block. The `pending_review` layer can hold either, but the line
   is his.
3. **Does the coach's review run on a schedule, on request, or when the record trips something?**

---

# The proposed engineering answer

Written 13 September 2026 at David's request. **A proposal, not a decision.**

## The thing to notice first

David's four layers describe **two different objects, and he called both of them the file**.

- **The programme.** What he intends to do. Changes every few weeks. One document. Written by an AI, read
  and argued with by a human. Its value is that a person can read it.
- **The record.** What actually happened. Changes several times a minute during a session. Tens of
  thousands of rows. Written by a machine, read by a machine. Its value is that it can be queried.

Those have opposite requirements, and no single storage choice serves both. He half-spotted this himself,
writing "a tracker (maybe a straight database is better)". It is. Markdown for the programme, a database
for the record, and the argument is the nature of the data rather than anyone's preference.

The record already exists and needs nothing. Everything below is about the programme.

## The recommendation: the programme is a versioned document in the database, not a file on disk

Store the markdown itself in a `programmes` table, one row per version, with the raw text as a column.
**On write, parse it and expand it into the `workout_templates`, `template_exercises` and
`mesocycle_weeks` rows the app already runs on, in the same transaction.** A document that will not parse
is a rejected write, so nothing changes and the last good programme keeps running.

The app is then unchanged. It still instantiates a session from validated rows, exactly as it does today.
It never parses markdown, and certainly never in the gym.

**The reason it is not a file on disk is that the coach is remote.** An LLM coach has no filesystem on the
droplet. If the programme lives at `/srv/omega/programme.md`, giving the coach the ability to edit it means
giving something shell access, which is a far larger security surface than a scoped API write. As a
document in the database it is `GET /programme` and `PUT /programme`, and the write gate in `docs/API.md`
already covers it. That gate was built for precisely this.

Three things fall out for free.

- **Provenance.** Each version has a number, and every workout records which programme version it was
  instantiated from. When the coach changes something, the record says which sessions ran under which
  programme. That is the audit trail that makes an AI-written programme trustworthy after the fact.
- **History.** Old versions are rows, so "what did my programme look like in March" is a query.
- **No sync problem.** There is one source of truth and one way in.

It is also explicitly **not** in the git repository. The programme is user data that changes weekly. Code
deploys should not be how David changes his reps.

### What it costs

He cannot open it in a text editor without fetching it first. That is a real ergonomic loss against a
plain file, and the fix is a small CLI that pulls, opens `$EDITOR`, and pushes back, or eventually an
editor in the app.

## The format: yaml blocks carry the numbers, prose carries the reasoning

The parser must never guess. So the structured data goes in fenced yaml blocks, which LLMs produce
reliably, and everything outside them is prose that is stored verbatim and never parsed.

```markdown
## Day 1, Quads and Pull

### Barbell Back Squat
```yaml
sets: 3
reps: [6, 8]
rir: 3
rest: 180
priority: true
ramp: [70, 85, 100]
```
First because it is the hardest thing in the session and it should get the best of you. The ramp is
there to let the pattern warm up under load rather than costing you a working set.
```

The prose under each exercise is the "why is this here" layer David asked for. It is shown on the session
screen next to the engine's own rationale, and the two are different things: the engine explains today's
number, the programme explains the exercise.

The block structure (week count, set ramp, effort ramp, deload week) is expressed the same way at the top
of the document, because otherwise there are two authoring surfaces and they will disagree.

## How the coach fits

The coach reads `GET /programme` and `GET /summary`, which is the document and the record together, which
is exactly layer four. To change something it writes a **proposed** version. That version is stored and
compiled but not made active until David accepts it. The existing `pending_review` design is the
mechanism, and the coach's token scope stays the enforcement.

So the coach can rewrite the programme and cannot touch a single logged set, cannot change a load
decision, and cannot make anything live on its own.

## Scope, which is smaller than it looks

Three of David's four layers are built. This is layer one plus the gate:

1. A `programmes` table, versioned, with the raw markdown and the parse result.
2. A parser, which only ever reads fenced yaml and treats everything else as opaque text.
3. `GET /programme`, `PUT /programme`, and a proposals list.
4. The accept and reject screen, which is a page David has not seen yet and is not in `docs/PAGES.md`.
5. The seed rewritten to produce a programme document that compiles to the rows it writes today, so
   nothing is special-cased.

Not a rewrite. A table, a parser, two endpoints and a screen.

## What chalk is least sure about

**Whether the prose should be per exercise or per session.** Per exercise keeps the reason next to the
numbers, which is why it is proposed. Per session reads better as a document. This is a writing question
more than an engineering one and David will know the answer once he sees one.

**Whether the coach should propose a whole document or a diff.** A whole document is far simpler to
validate and to reason about. A diff is easier to review. Proposing whole documents and rendering the diff
for review gets both, but rendering a useful markdown diff on a phone is real work.

---

# Second opinion, and the revision that came out of it

David sent the proposal above to GPT Astra on 13 September. Astra's review was better than the proposal.
Recorded here with the corrections accepted, the two places chalk pushed back with evidence, and what is
now actually open.

Astra stated up front that they could not see the repository, so several concerns are about behaviour that
already exists. Those are answered below with code references rather than argument.

## Four things chalk had wrong

**1. File against database was a false dichotomy.** Chalk argued the programme must live in the database
*rather than* a file, on the grounds that a remote coach has no filesystem. Astra separated authoring from
runtime, which dissolves the argument entirely. Author in a file, wherever is convenient, including git.
Import it through a restricted mechanism that validates it. Store the exact imported document and its
compiled rows. After import that version is immutable, and a further file edit makes another proposal,
not an edit. There is no synchronisation to reconcile because nothing syncs.

This gets the convenient authoring chalk was arguing against and the runtime reliability chalk was
arguing for. Astra's accompanying point stands on its own: git tells you what changed, and does not tell
you which version a phone actually used. Version provenance is not something a commit gives you.

**2. "A database suits the record and not the programme" is too strong, and chalk contradicted it in the
same document.** The proposal argued markdown against database and then proposed markdown inside a
database. A database stores a document perfectly well. The honest justification for markdown is David's
stated preference to read and revise a whole document, which is a real requirement and did not need a
fabricated technical one propping it up.

**3. A genuine contradiction about prose.** The proposal said prose is stored verbatim and never parsed,
*and* that per-exercise prose is displayed in the app as the reason that exercise is there. Both cannot be
true, because associating a paragraph with an exercise is parsing. Astra's fix is taken: **exercise
rationale is an explicit field on that exercise**, and surrounding prose is for the programme's overall
reasoning and is genuinely never interpreted.

Also taken: **one designated yaml block holding the whole executable programme**, with prose around it,
rather than executable blocks scattered through the document. Simpler to validate and much harder to get
subtly wrong.

**4. Do not hold the write transaction open during parsing.** The proposal said parse and expand inside
one transaction. SQLite allows a single writer, so parsing inside it blocks every other write for no
benefit. Parse and validate first, then persist the document and its compiled rows in a short transaction,
checking the conditions that genuinely depend on database state inside it.

And validation was hand-waved. Valid yaml is nowhere near a valid programme. It has to check that every
exercise id exists, that set counts and rep ranges are sane, that week definitions are complete, that
unrecognised fields are rejected rather than ignored, and that the document cannot expand unboundedly. Use
an off-the-shelf yaml parser in strict mode with duplicate-key detection, and write the domain checks
here.

Storing source text alongside compiled rows is safe **only** while the rows are derived and cannot be
edited independently. Two independently editable representations would be the actual problem.

## The real gap Astra found: nobody specified what activation means

The proposal specified storage and skipped the semantics. That is the weaker half and Astra was right to
lead with it. What follows is what the repository already settles, and what remains open.

### Already handled, with references

**A programme changing during a workout cannot affect that workout.** `WorkoutExercise` copies the entire
prescription at instantiation (`target_sets`, rep range, `target_rir`, `suggested_weight_kg`,
`target_reps_by_set`, `target_tempo`, `reason`, `rationale`, `flags`, `constraint_notes`) and the running
session never re-reads the template. See `packages/core/src/types.ts`, the stored prescription block.

**Historical versions are genuinely immutable.** `template_exercises` is keyed by
`(template_id, template_version)`, and `PATCH /templates/:id` inserts new rows at `version + 1` rather
than updating in place (`apps/api/src/routes/templates.ts`). A workout records `template_id` and
`template_version`, so an old session points at the rows it actually ran. Astra's concern that a recorded
version id is insufficient if the rows can change is answered: they cannot.

**Late-arriving sets attach to their original session.** A set belongs to a `workout_exercise_id`, which
carries its own frozen prescription. Nothing reinterprets it against the current programme.

**Sync retries cannot duplicate.** Every create accepts a client-supplied UUID and returns the existing
row on a repeat (`docs/API.md`, idempotent creates).

### Genuinely open, and these block the design

1. **What accepting a programme does to the current block.** Nothing decides whether acceptance continues
   from the present week or restarts the block. Astra is right that a document revision must never
   silently reset the week, and right that it should be an explicit choice at acceptance. Undecided.
2. **Stale proposals.** There is no proposal layer at all yet, so nothing marks a proposal stale when a
   newer one is accepted first. Acceptance must apply to the exact version that was reviewed and must
   fail if the active programme moved underneath it. Astra's suggestion of HTTP conditional requests,
   an ETag on the active programme and `If-Match` on acceptance, is a clean standard mechanism for this.
3. **Starting a session offline.** Today the client must be online to start a session, because the
   prescription is computed server-side (`docs/PAGES.md`, offline logging and sync). Astra's requirement
   of a complete cached accepted version that keeps its identity through sync is not met and would be a
   real piece of work. This is a pre-existing gap rather than one this proposal creates, but it is now
   written down.

## On the permission boundary

Astra and chalk agree, and Astra sharpened the wording. The coach reads training data and submits
programme proposals. The user alone activates. A coach credential must not be able to activate a version,
alter a recorded set, change engine rules, or remove a physio constraint.

Astra's warning is worth quoting in effect: an agent with unrestricted access to the production database
or to the code is not restricted to proposals merely because its instructions say so. That is the same
reason `docs/API.md` says token scope is the enforcement rather than the plan.

The sharpest sentence in the review is the boundary statement, and it is better than the one in
`docs/API.md`: **programme changes legitimately affect future loads, through exercises, rep targets and
effort targets. The enforceable boundary is that the coach changes permitted programme inputs, while the
engine calculates the loads and independently enforces the constraints.**

## Revised build order

Astra's, adopted. File import, validation, immutable versions, a review that shows what actually changed,
and explicit activation. Defer the editor. Settle the activation semantics above before choosing
endpoints.

Still parked until David says otherwise.
