# Importing David's Strong history

David sent his full Strong export on 11 September 2026. Chalk analysed the real file. This page is what the
importer must handle and which choices are still open. The importer itself is item 5 in `docs/LANES.md`.

The real file is **not in this repository** and must not be, because it is nine years of one person's training
history. David keeps it on his own machine and passes the path to the CLI. A fixture reproducing every
structural edge case below lives at `apps/api/src/import/fixtures/strong-sample.csv`, and that is what the
tests run against.

## What the file is

- 14,371 sets across 1,326 sessions, 14 July 2017 to 7 September 2026.
- 123 distinct exercise names, of which 41 appear in the last 12 months.
- 1.1 MB, UTF-8, comma separated, quoted text fields, LF line endings.
- Header, exactly: `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE`

This is one of several layouts Strong has shipped. Older exports carry `Notes` and `Workout Notes` columns and
newer ones carry a `Workout Duration` spelling. The importer reads by column name, never by position, and fails
loudly on an unknown header rather than guessing.

## The five things that will break a naive importer

**1. `Set Order` is not always a number.** Three letter codes appear: `W` for a warm up (130 rows), `D` for a
drop set (29) and `F` for a set taken to failure (22). A parser that calls `parseInt` on this column silently
turns every warm up into set 0 or NaN. `W` maps to `is_warmup: true`, which Omega already excludes from volume
and from every progression decision. `D` and `F` have no Omega equivalent and import as ordinary working sets,
which is safe because they are 0.35% of the file and none of the history feeds progression anyway (see below).

**2. There is almost no effort data.** `RPE` is filled on 3 rows out of 14,372. Nine years of training carries
no usable effort record. Every imported set therefore gets `rir: null` and `rir_observed: false`, which makes
every imported session non-qualifying under the `no_rir` rule. Consequences, and they are not a bug:

- The engine will not progress anyone's load off imported history. It cannot, because it has no evidence any
  set was easy, which is exactly what amendment A1 is for.
- It still reads the most recent session's weight through the C1 fallback, so it does prescribe the right
  starting weight. It just says `first_time` while doing it.
- Volume accounting, the e1RM chart and everything the coach reads all work off imported history normally.
- Progression starts from David's first Omega session with effort recorded.

Where Strong's RPE is present, convert it as `rir = 10 - rpe` and set `rir_observed: true`. Three rows, but the
rule is cheap and it is correct.

**3. The units changed in December 2019.** Strong exports in whatever unit the app is currently set to, and
David's is kilograms, so the whole file is kilograms. But he logged in pounds until November 2019, and those
rows are converted, which is why they read 61.23 and 43.09 rather than 60 and 45. Measured: 97% of 2017 and
2018 weights are a whole number of pounds and 4% are a clean kilogram value, and from December 2019 that
reverses to 0% and 100%.

So a `--units` flag applied to the whole file, which `docs/LANES.md` originally called for, is the wrong design
and it would double-convert the recent half. **Import every weight as the kilograms it already is.** Do not
round the converted era to a plate grid. 61.23 kg is what he lifted, and rounding it invents a precision the
file does not have.

**4. Weight 0 means bodyweight, not no load.** 1,414 rows, nearly all of them chin ups (677), dips (281 and
129) and push ups (79). Omega has `Exercise.uses_bodyweight` for exactly this. An importer that treats 0 as a
real load computes an e1RM of zero for his most-trained pull movement.

**5. Reps 0 means the set was measured in time or distance.** 42 rows, all rowing, cycling and planks, and they
carry `Distance` or `Seconds` instead. These are not strength sets. Route them to `POST /cardio` or skip them,
and never write a zero-rep set to `set_logs`.

## Smaller things that still need handling

- **Workout names carry stray whitespace.** 12 of them, for example `Day 1 ` and `Push / Isolation : DAY 2 `.
  Trim before matching.
- **Ten rows are exact duplicates.** Derive each set id deterministically from the session timestamp, exercise
  name and set order so a re-run is idempotent and a duplicate row collapses rather than doubling a set.
- **Twelve calendar days hold more than one session.** Omega supports this. Key sessions on the full timestamp,
  never on the date alone.
- **`Duration` is a display string** such as `1h 36m`. Parse it to seconds for `completed_at`, or drop it.
- **`Date` is the session start, repeated on every row.** There is no per-set timestamp.

## Exercise mapping, which is the bulk of the work

Strong names exercises as `Movement (Equipment)` and Omega names them naturally, so `Bench Press (Barbell)`
must reach `Flat Barbell Bench Press` and `Squat (Barbell)` must reach `Barbell Back Squat`. An exact-name
importer matches 7 of the 41 exercises David currently trains.

Build an explicit mapping table for those 41, checked in as data. For the 82 names he has not touched in a
year, create archived library entries carrying the Strong name, so the history imports and nothing is lost.

**An auto-created exercise has no muscle credits, so it contributes nothing to the volume dashboard, silently.**
That is the same hole `docs/PAGES.md` records against the exercise picker. The importer must either ask for
credits or mark the exercise as uncredited so the dashboard can say what it is not counting.

## What the real file says about the seed, which David should see

The seed data was written from the spec. The export is evidence. They disagree.

- **The spec's premise of roughly four weeks off is not what happened.** David trained 65 times in 2026 and his
  longest break since January 2025 was 28 days, ending 5 January 2026. His last Strong session was 7 September
  2026, four days before he sent the file.
- **The seeded bench restart load of 42 kg is about 10 kg light.** He benched 52.5 kg for 10 and 12 reps on
  31 August 2026 and 55 kg on 20 August.
- **Those seeded loads would override the truth.** In stage C1 `starting_load_kg` is checked before the most
  recent session's weight, so seeding 42 kg makes the engine ignore an imported 52.5 kg. Once the import runs,
  `SEED_RESTART_LOADS` should be dropped rather than corrected, because his real history is better evidence
  than a number transcribed from a spec.
- **Preacher Curl and Machine Curl are not a duplicate.** `docs/DECISIONS-FOR-DAVID.md` flags them as one
  machine entered twice. He logs both, in the same week, at different loads. The seed is right.
- **The elbow injury is recent and the data agrees.** He curled at 20 to 25 kg through 24 August and his
  session on 7 September contains no curl of any kind, the first Day 2 in the series without one. The seeded
  5 kg cap is a sharp drop from 20 kg, which is the physio's call and not something the file can settle.

## Open, and David's to decide

1. **How far back to import.** Recommendation: all of it. The engine only looks at a 42 day window, so the
   older years cost nothing and give the coach and the charts nine years of context.
2. **What to do with the 82 retired exercises.** Recommendation: import them archived, so history is complete
   and the picker stays short.
3. **Whether imported sessions should attach to the current mesocycle.** Recommendation: no. Import them with
   no mesocycle and no template, as loose history. Back-dating a block he did not run would corrupt the week
   ramp and the volume dashboard.

## CLI shape

`pnpm --filter @omega/api import:strong -- --file <path> [--dry-run] [--map <path>]`

`--dry-run` prints the counts, every unmapped exercise name and every skipped row with its reason, and writes
nothing. Run it first, always. No `--units` flag, for the reason in point 3.
