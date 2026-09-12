# How a programme gets into Omega

**PARKED by David on 12 September 2026. Do not build against this page.** He knows what he wants and is
still working out how it should sit in a database. Nothing on this page is decided, including chalk's
recommendation below, and nobody should treat it as a spec until he unparks it.

**Parking it blocks nothing.** Flint's queue (issues 9, 11, 12 and the Strong importer) does not touch it.
Amendment A6, prescribed ramps, is safe to build because it changes what a template can express and that
is true wherever templates come from. Pages 1, 2 and 3 render whatever a programme produces and do not
care how it was authored. The only thing this holds up is coach write access, which was gated anyway.

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
