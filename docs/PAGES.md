# Pages and features. The running list.

This is the backlog for the Flutter client, and it is the list we work through one page at a time. David owns
the order. Chalk writes each page's spec. Flint builds it.

## How a page moves through the list

1. **David and chalk settle it.** What the page is for, what is on it, the hard cases (offline, empty, error,
   first run, injury-constrained), and what "done" looks like on his phone.
2. **Chalk writes the spec** to `docs/pages/<page>.md`.
3. **Flint runs a code reality check.** Read the spec against the repo and say whether it matches before
   writing anything. If the spec names an endpoint or field that is not there, say so first.
4. **Build ready is a state, not an opinion.** Nothing gets built from a spec that has not passed step 3.
5. **Flint builds it, chalk reviews it against the spec, David accepts it on his phone.**
6. Only then does the next page open. One page in flight at a time.

## Status key

Not started means no spec exists. Spec'd means the spec is written and has passed the code reality check.
Built means merged and accepted by David on a real phone.

Every endpoint named below already exists and is tested on the server. No page in this list needs new backend
work unless it says so.

---

## The spine. Everything needed to train.

David chose on 12 September to wait for Flutter rather than deploy the PWA and train on it meanwhile. So these
three pages are the MVP. Until all three exist he cannot log a single session in Omega and he keeps using
Strong, which means page one landing alone changes nothing for him. Build them in this order, but treat the
three as one milestone.

**1. Active session.** Not started. *This is page one and the whole app is judged on it.*
The screen you hold between sets. Shows each exercise with what the engine suggests and why, your numbers from
last time, and a row per set to log weight, reps, effort and pain. Auto-starts the rest timer when you log a set.
Reads `GET /workouts/:id`. Writes `POST /workouts/:id/sets`, `PATCH /sets/:id`, `DELETE /sets/:id`,
`PATCH /workouts/:id` to finish.
Decisions already made that bind this page.

- **The effort chips are the button that logs a working set.** David ruled on 11 September. You type the reps
  and tap how many you had left, and that one tap both records the effort and completes the set. There is no
  separate tick on a working set, so there is nothing to skip past. Warmups and AMRAP sets keep a plain tick,
  because effort is meaningless on a warmup and an AMRAP set is effort zero by definition. A small "no answer"
  option stays for when he genuinely will not say.
- **The question is reps left in the tank, not how hard out of ten.** David ruled on 11 September. Chips 0 to 5,
  where 0 means nothing left. This matches what the engine already stores, so nothing converts.
- **The evidence behind both.** His Strong export carries three effort values in 14,372 sets over nine years,
  and both attempts died inside a single session. Strong could always record effort alongside reps, so the
  failure was not capability, it was that answering cost a separate action. See `docs/STRONG-IMPORT.md`. Any
  design that makes effort a thing you do *as well as* logging the set has already been tested on this user and
  it lost. Effort is the single input the whole progression engine turns on, so this page either solves it or
  the app does not work.
- The effort control must still show whether a value is his or the engine's guess, and say what unlocks a held
  progression (`docs/ENGINE-RULES.md`, amendments A1 and A2). Under the ruling above an assumed value should
  now be rare, because the only way to log a working set is to answer.
- Colour has one owner each (`docs/DESIGN-REVIEW.md`).
- One exercise open at a time, because the version chalk built ran to eight phone screens.
- The "today was rough" toggle lives here now, not on a separate readiness page.
- **Plain words, not gym jargon.** David did not know what AMRAP meant when he saw it on a button in his
  own app, so the label is "To failure". Nothing in this app uses a term he would have to look up, and
  "Skip" next to the rest timer is now "End rest" for the same reason, since it only ever cleared the
  timer and could have read as skipping a set.
- **Weight and reps are both targets and both lead.** On an exercise with no load, the reps lead alone.

Two open questions on this page, both raised by David on 12 September.

- **Per-set weights.** He varies the weight across sets in 64% of his exercise-sessions (27% ascending,
  16% descending, 21% up and down, against 36% flat), and the engine prescribes exactly one weight.
  The mockup answers it by displaying last time's actual ramp, which costs nothing, and the engine keeps
  reading the modal working weight, which already handles his real pattern of working up to a top set.
  Whether the engine should prescribe a ramp is undecided and it is a real amendment if so, because the
  rule for advancing a flat weight does not generalise to a pyramid.
- **Coach-written exercise notes.** David asked for a markdown file per exercise holding cues and the
  reasoning for why it is in the programme, readable and editable by the coach, shown alongside the
  engine's own rationale. Chalk's reading of the scope is awaiting his confirmation before it gets a
  contract. It is a new feature, not a screen change.

**2. Today.** Not started.
The landing screen. What block and week you are in, which routines you can start, and a resume card if a session
is open. Reads `GET /mesocycles/current`, `GET /templates`, `GET /workouts?from=&to=`, `GET /volume?weeks=1`.
Writes `POST /workouts` to start one.

**3. Connection setup.** Not started.
Server address and token, and a test button. Small, but nothing works without it. Reads `GET /api/health` and
`GET /mesocycles/current` to prove the token. Worth building as a rough stub early so pages 1 and 2 can be
reached on a real phone, then polishing it properly in its turn.
This page is also what makes the droplet hostname urgent again. Flutter reaches the API over HTTPS exactly as
the PWA would have, so the hostname is still on the critical path, just a week or two out rather than today.

---

## Then, in proposed order

**4. History.** Not started.
List of past sessions with date, routine, set count, and a badge when a session was marked compromised.
Reads `GET /workouts`.

**5. Past session detail.** Not started.
One finished session, read only. Largely the session screen in a locked mode. Reads `GET /workouts/:id`.

**6. Exercise picker and library.** Not started. *You asked for this explicitly.*
Search the exercise library and add an exercise, either into the session you are in or into a routine. Search
uses the `aliases` field, which is already seeded and indexed, so "incline curl" finds "Incline Dumbbell Curl".
Also creates a new exercise when the library does not have it.
Reads `GET /exercises`, `GET /exercises/:id`, `GET /muscle-groups`. Writes `POST /exercises`,
`POST /workouts/:id/exercises`.
One open question for this page: a new exercise needs muscle credits or it contributes nothing to your volume
numbers, and it will do so silently. The page has to ask for them or mark the exercise as uncredited.

**7. Volume dashboard.** Not started.
Hard sets per muscle this week against target. Reads `GET /volume?weeks=4`.
Decisions that bind it: the target range is drawn as a visible band so you read in or out from geometry rather
than colour, and being under target mid-week is not an alarm state.

**8. Routine editor.** Not started. *You asked for this explicitly.*
Change a routine's exercises, sets, reps and rest. Editing creates a new version and leaves past sessions
untouched. Reads `GET /templates/:id`. Writes `PATCH /templates/:id`, `POST /templates`.

**9. Exercise detail and progression history.** Not started.
One exercise over time. Working weight, best estimated one rep max, stall count, and what the engine would
prescribe next with its reasoning. Reads `GET /progression/:exercise_id`.

**10. Block view.** Not started.
Where you are in the mesocycle, which week, what the set ramp and effort target are, and when the deload lands.
Reads `GET /mesocycles`, `GET /mesocycles/current`. Writes `POST /mesocycles` to lay out the next block.

**11. Injuries and constraints.** Not started.
The active injury, its caps, and marking a constraint cleared when the physio signs off. Matters because a
constraint now stops the engine prescribing entirely, so clearing one is how you turn prescriptions back on.
Reads `GET /injuries`. Writes `POST /injuries`, `PATCH /injuries/:id`, `POST /injuries/:id/constraints`,
`PATCH /constraints/:id`.

**12. Readiness.** Not started, deliberately last.
Demoted at your request. The endpoints and schema stay because the coach reads them, and the one control that
carries most of the value already moved onto the session screen. Reads and writes `GET /readiness`,
`POST /readiness`.
Open question for you: bodyweight lives on this record, and it is the one thing here a lifter usually does want
to track. If readiness is effectively off, bodyweight needs somewhere else to live, or it goes untracked.

---

## Features that live inside pages rather than having one of their own

These are cross-cutting, so each page's spec says how it handles them.

**Offline logging and sync.** Every set you log queues locally and replays when the phone reconnects. Every
create endpoint accepts a client-generated id and is idempotent, so a replay cannot duplicate. Starting a session
needs a connection, because the prescription comes from the server.

**Rest timer.** Starts itself when you log a set. Must survive the screen locking, so it works from an end
timestamp rather than counting down in memory.

**Effort entry.** One tap, and that tap is what logs the set. See page 1 for the ruling and the evidence, and
amendments A1 and A2 for why an assumed value cannot add weight to the bar.

**Pain flag.** One tap, four states, with an optional note. This is the only alarm colour in the app.

**Warmup and AMRAP marking.** Warmups are excluded from volume and from every progression decision. Marking a
set AMRAP forces its effort value to zero, because going to failure is an observation.

**Left and right for single-limb exercises.** Both sides share a set number. Together they count as one set
toward volume, not two.

---

## Not in the page walk

**Server queue.** Items 1 to 5 in `docs/LANES.md`, which are flint's now. Specified, and they run in parallel
with us writing page specs.

**Strong import.** Specified in `docs/STRONG-IMPORT.md` against David's real export. Server side, a command
line tool rather than a page.

**Apple Health cardio.** Flutter reads HealthKit directly, which is one of the reasons David chose it. Not a
page, and not early.

**Coach approvals.** The gate on ever giving the coach write access. Server side, when you want the coach
writing rather than just reading.

**Video form review.** Milestone 5 in `docs/PLAN.md`. It needs a contract rather than a spec, and it is the
point at which the server lane splits from the client lane.
