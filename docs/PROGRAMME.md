# How a programme gets into Omega

**PARKED by David on 12 September 2026. Do not build against this page.** He knows what he wants and is
still working out how it should sit in a database. Nothing on this page is decided, including chalk's
recommendation below, and nobody should treat it as a spec until he unparks it.

**Chalk's proposed engineering answer is at the bottom of this page, written 13 September at David's
request. It is a proposal awaiting his yes, not a decision.**

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
