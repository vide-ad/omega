# Design review — decisions

Review by David's UI/UX agent against the first mockup, plus David's own notes. This page records what
was accepted and what each lane has to do. The reviewer's marked-up mockup is `docs/mockup/omega-uplift.html`;
the original is `docs/mockup/omega-mockup.html`, kept for comparison.

Everything here was accepted. Two items reach past the design and change the contract; they are first.

## 1. An assumed RIR must not be able to add load — accepted, contract change

**The finding.** RIR was pre-selected at the target and styled identically to a value the user had chosen, so
the default path (glance, tap Log) recorded an assumption as an observation. Mean RIR is the single input the
progression engine turns on.

**Verified against the built engine**, target RIR 3, all sets at the top of the range:

| What the user did | Reason | Prescription |
|---|---|---|
| Never touched the chip (pre-filled 3) | `progress_load` | 45 kg |
| Reported 2 — harder than asked | `consolidate` | 42.5 kg |
| Reported 4 — easier than asked | `progress_load` | 45 kg |
| No RIR at all (null) | `first_time` | 42.5 kg |

So an untouched default was indistinguishable from a positive report that the set was easy, and *more*
dangerous than recording nothing — the convenience default converted "we don't know" into "the lifter said it
was easy", then added weight on it.

**Decision.** Add `SetLog.rir_observed: boolean`. `true` when the user picked the value or the set is AMRAP
(RIR 0 by definition); `false` when a pre-filled default went unchallenged. `progress_load` now requires
observed effort — the full rule is in `docs/ENGINE-RULES.md` under *The effort test*. Assumed RIR still counts
for hard-set volume, for qualification, and for `progress_reps`. It buys rep progression, not load progression.

This also gives the coach something it never had: which sessions were reported versus clicked through.

**Lanes.** `core` — the effort test and `rir_observed` on the type, with tests for the four rows above.
`api` — column, migration (existing non-null `rir` reads as observed), accept the field on set writes, default
`true` when omitted so importers and the coach are unaffected. `web` — send `false` unless the chip was
touched, and render assumed as a dashed brass outline against a solid chalk fill for chosen, with the label
saying which ("engine assumed 3" → "you said 2").

## 2. Colour had to mean one thing — accepted

The engine's brass `#C8963E` and the amber used for under-target, warmup and niggle-pain `#D9A441` sat
**ΔE00 4.5** apart, close enough to read as one colour. The product's central claim — a brass number is an
instruction, not a record — was carried by a hue with three other jobs. The constraint colour sat ΔE00 10.3
from ordinary secondary text, so "a physio limit applies here" looked like a caption.

**The contract, now enforced:** brass is the engine and nothing else; warm is pain and nothing else; slate is a
condition that limits what the engine may conclude; moss is banked work; volume reads from geometry and needs
no hue at all.

Worth keeping as a general method: the constraint collision was fixed by warming the *grey it collided with*,
one token, moving ΔE00 10.3 → 30.6. When two things collide, moving the background is often cheaper than moving
the thing you care about.

## 3. Density is a hierarchy problem — accepted

Seven expanded cards made ~4,000px of scroll and put the most-pressed control wherever the scroll left it. One
exercise open, the rest one-line rows: the session fits a screen, Log lands in about the same place every set,
and the open card can afford to be *more* generous. No information was cut.

## 4. The volume range must be visible — accepted

Target boundaries were 1.5px hairlines at **1.20:1 and 2.48:1** against their track. The chart's only job is
"am I inside the range" and the range could not be seen, so status fell entirely to hue. It is now a drawn band;
under/in/over reads from where the bar ends. Works in greyscale, for a colourblind reader, and on a dim screen.

## 5. "Not finished yet" is not "wrong" — accepted

Under-target was amber, a warning. On Wednesday you are under target because it is Wednesday. `GET /volume`
already returns `partial: true` for the current week, so the client has what it needs — no API change. Progress
states get a neutral treatment; alarm colours stay reserved for pain and injury, which is the one signal that
must land.

## 6. Type: two families, mono means a measured quantity — accepted

Three families to two, eighteen sizes to eight, and monospace reserved for numbers you compare — weights, reps,
RIR, times. Labels are never mono. Also fixed: the "kg" unit beside each prescription measured **2.25:1**.

## David's notes

**Exercise management — the API already does all three; the UI does none of it.** Verified:

| Ask | API | Tested | UI |
|---|---|---|---|
| An exercise library you can add to | `POST /exercises`, `PATCH /exercises/:id` | yes | **missing** |
| Add an exercise mid-session | `POST /workouts/:id/exercises` | yes | **missing** |
| Add an exercise to a routine | `PATCH /templates/:id` (new version, old rows kept) | yes | **missing** |

So this is a `web` lane job, not new backend work. Two gaps to close while doing it: removing an exercise from a
running session, and a searchable picker over the 36-exercise library using the `aliases` field that is already
seeded and indexed.

**Readiness demoted, not deleted.** David: *"really not important or necessary"*. Accepted, with one consequence
stated plainly. Without a readiness log the only session-level compromise triggers left are the deload week and
the manual toggle, so a genuinely bad day is read as real: sets fall short, and two such sessions in a row drop
the load 10% via `regress_load`. Pain flags are unaffected — they are logged during the session, so injury
protection survives; fatigue protection does not.

**Decision:** keep the schema and endpoints (built, costs nothing, the coach reads them), drop Readiness from the
bottom nav, and move the single control that carries most of the value — *"today was rough"* — onto the session
screen as one tap. No morning ritual, and the engine keeps its escape hatch.

*Note on the evidence (wren's review).* "David finds it unnecessary" at setup time is weak evidence that it is
unwanted — on North he never set an availability window and then found the scheduler "messy", because it was
scheduling around a life it knew nothing about. Non-use at setup is often non-discovery. The cost of being wrong
here is near zero because schema and endpoints stay, so the call stands; but "David didn't use it" must not harden
into "users don't need it" without something better behind it.

## Left open, deliberately

Two things the reviewer flagged that a mockup cannot settle, both requiring a phone and a real session:

- **Dark-only.** The reasoning holds for 6am and bad lighting, but gyms are also bright — big windows, white
  walls — and the hard case is a sweaty screen at reduced brightness in direct sun.
- **Whether any of this works with a pump, between sets, at arm's length, when you are annoyed.** One session
  with one real lifter beats another design pass.

Both belong to the `web` lane's on-device gate before M1 is called done.
