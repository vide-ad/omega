# Three decisions that are yours, not mine

Wren's ruling: I can settle anything the repository can settle. I cannot settle anything only your preferences
can. These three I settled anyway, because the spec contradicted itself and I needed a coherent reading to
build against. They are implemented and tested — but each has a second reading that also works, so they need
your explicit yes. One pass; yes or no on each.

I expect you to agree with all three. That is not the point. The point is that a document I wrote is currently
overriding a document you commissioned, and your consent is the only thing that makes that legitimate.

---

## P1 — A constrained exercise still progresses, inside its cap

**Your spec (§5.2, §5.3):** an exercise with an active injury constraint is "compromised", and compromised
exercises never qualify for progression.

**What the engine does:** constrained exercises qualify normally, and the constraint is applied as a clamp
*after* the load decision — weight capped at `max_weight_kg`, reps floored at `min_reps`, tempo enforced, the
physio note attached, and the rationale says what the clamp changed.

**The other reading:** hold §5.2 and §5.3 exactly as written, and fix §3.2 and §9.4 instead. Constrained lifts
would then never progress by engine at all — every curl under your radial-nerve constraint reads *"set a starting
load"* every session, and escalation ("~1 kg per 2 pain-free weeks") is done by hand by you or the coach.

**Why this is yours:** it is a safety decision made under a real injury. Option A lets the engine push toward the
cap on evidence; option B keeps the engine's hands off the injured limb entirely.

**My recommendation:** A, as built. The cap is enforced either way; A just lets the engine do the arithmetic
inside it and show its working.

> **Yes / No:** ________

---

## P2 — Soreness compromises the exercise, not the whole session

**Your spec (§5.2):** any soreness rating ≥ 4 for a muscle trained in the session marks the *whole workout*
compromised.

**What the engine does:** soreness ≥ 4 compromises only the exercises that train that muscle (credit ≥ 0.5).
Sore biceps take the curls out of progression; the squat still counts.

**The other reading:** session-wide, as written. Sore biceps invalidate squat progression too — the argument
being that a day you woke up that sore is a day nothing should count.

**Why this is yours:** it is a judgement about what a bad-recovery signal means, and the spec's reading is
coherent, just blunt.

**My recommendation:** exercise-level, as built. Session-wide throws away good data on every muscle that wasn't
sore.

> **Yes / No:** ________

---

## P3 — An untouched RIR chip can never add load

**Your spec (§7):** RIR "pre-filled with the target, adjustable" — one tap per set.

**What the engine does:** the pre-fill stays, but a default that was never touched is recorded as *assumed*,
not *observed*, and `progress_load` requires observed effort. Assumed RIR still counts for volume and for rep
progression. When a progression is withheld for this reason, the app says so and tells you what unlocks it.

**The other reading:** the pre-fill counts as observed. One tap fewer per set; the engine adds load on defaults.
Verified against the built engine: under that reading an untouched chip and a genuine "that was easy" report
produce identical `progress_load 45 kg`, and recording nothing at all is *safer* than the pre-fill.

**Why this is yours:** it decides what the app demands of you in return for load progression. Someone who won't
spend one tap gets rep progression and never gets load progression. That is a contract between the app and its
user, and nothing in the codebase can say whether it is the right one.

**My recommendation:** as built. Mean RIR is the single input the whole engine turns on; a default is not an
observation.

> **Yes / No:** ________

---

## Also yours, not blocking anything

- **The hostname.** The only thing between you and logging real sessions. Domain or DuckDNS.
- **Seed volume ramp.** As seeded, quads reach ~32 weekly sets by week 4 against a 15–20 target. The audit
  suggested priority on only the first quad slot per day and a 0,1,1,2,2 ramp.
- **Two seed oddities.** "Preacher Curl" and "Machine Curl" look like the same machine twice; the Bayesian cable
  curl is standing while the physio note says seated only.
