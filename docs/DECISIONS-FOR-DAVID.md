# Three decisions that are yours, not mine

**All three were ruled on by David on 8 September 2026. This page is now a record, not a request.**
P1 reversed what chalk built. P2 and P3 confirmed it. The rulings are at the bottom of each section and in
`docs/ENGINE-RULES.md` under Amendments.

Wren drew the line: chalk can settle anything the code can settle, but not anything only David's preferences can
settle. Chalk settled these three anyway, because the spec contradicted itself and he needed one coherent reading
to build against. Each had a second reading that also worked, so each went back to David.

He ruled on all three, and he reversed the one with a safety dimension. That is the argument for asking.

---

## P1. When you are injured, should the app still name a weight?

**In plain terms.** Your right elbow has a physio cap of 5 kg on curls. Two ways to handle that.

Option A, which I built. The app works out what you should lift as normal, then refuses to let the answer go
above 5 kg. It shows you 5 kg, tells you the cap is why, and attaches the physio's note.

Option B, which your spec actually asked for. The app declines to suggest anything at all for any exercise under
a constraint. Every curl session shows "set a starting load" and you or the coach decide the weight by hand.

**Why it is yours.** Option A lets software make decisions about an injured limb, inside a limit you set.
Option B keeps software out of it entirely. That is a judgement about how much you trust the machine near a
nerve injury, and nothing in the code answers it.

**Deeper.** Spec sections 5.2 and 5.3 say a constrained exercise is "compromised" and compromised exercises
never qualify for progression. Sections 3.2 and 9.4 assume the opposite, that constrained lifts do get
prescriptions and just get capped. Both readings are internally coherent once you fix the other half. I chose to
hold 3.2 and 9.4 and reverse 5.2, applying the constraint as a clamp after the load decision (cap the weight,
floor the reps, force the tempo, surface the note). The clamp is enforced either way. The question is only
whether the engine does the arithmetic underneath it.

**My recommendation.** Option A, as built.

**David's ruling, 8 September 2026. Option B.** *"If injured let the user figure it out no recommendation
required."* The engine now prescribes no weight for a constrained exercise. It still shows the cap, the rep
floor, the tempo and the physio note as information. He sets the weight himself. One consequence he should
expect: the physio's "escalate about 1 kg per two pain-free weeks" is entirely manual now, and the app will
never nudge him toward it.

---

## P2. Do sore biceps ruin the whole session, or just the arm work?

**In plain terms.** You log soreness in the morning. Say your biceps are a 4 out of 5.

Option A, which I built. The app stops trusting your curl numbers that day, but still counts your squats
normally.

Option B, which your spec asked for. The app treats the entire session as unreliable, squats included.

**Why it is yours.** Option B has a real argument behind it. A morning where one muscle is that sore might mean
your whole recovery is poor, so nothing that day should count. That is a view about your body, not about code.

**Deeper.** The engine matches soreness to exercises by muscle credit at 0.5 or above, so sore biceps take out
the curls and the chin-ups (biceps credit 0.5) but leave the squat alone. Under option B a single sore muscle
discards good data on every muscle that was fine.

**My recommendation.** Option A, as built.

**David's ruling, 8 September 2026. Option A, as built.** He added that he distrusts soreness tracking in
general and thinks it invites trouble. That is a fair instinct and the exposure is small: the rule only fires
on a logged rating of 4 or 5, and he has already dropped the daily readiness form, so in practice it will
almost never fire.

---

## P3. If you never touch the effort slider, has it told the app anything?

**In plain terms.** After each set the app asks how hard it was, on a 0 to 5 scale, and pre-fills the number it
expected. Tap the tick without touching it and the number still gets saved.

Option A, which I built. The app records that you did not actually answer. It will still add reps, but it will
not add weight to the bar until you tell it how hard a set felt. When it holds back for that reason, it says so
and tells you what would unlock it.

Option B, which your spec asked for. The pre-filled number counts as your answer. One tap fewer per set, and
the app adds weight based on numbers you never confirmed.

**Why it is yours.** This decides what the app demands from you in return for progression. Under option A,
someone who will not spend one tap never gets a heavier bar. That is a bargain between you and the app, and no
amount of reading the code tells you whether it is a fair one.

**Deeper.** I ran this against the built engine. Target effort 3, all sets at the top of the rep range. An
untouched chip produced "add weight, 45 kg". A genuine report that the set felt easy produced exactly the same
thing. Recording nothing at all produced "hold 42.5 kg", which means the helpful default was more dangerous than
no data. Effort is the single input the whole progression engine turns on, so option B lets the engine add
weight to the bar on the strength of a guess it made itself.

Wren added a condition I had missed. Under option A the app must explain the hold, otherwise you get an app that
quietly stops progressing and never says why.

**My recommendation.** Option A, as built.

**David's ruling, 8 September 2026. Option A, as built.** *"It should tell the app nothing."*

---

## Also yours, not blocking anything

**The hostname.** The only thing standing between you and logging real sessions. Buy a domain (about 10 pounds
a year) or use a free DuckDNS subdomain. Either works. The origin cannot change later without reinstalling the
app and losing anything unsynced, so pick one you will keep.

**The volume ramp in the seed data.** As seeded, the block adds a set per week to every priority exercise, which
puts your quads at roughly 32 sets a week by week 4 against a target of 15 to 20. The dashboard will read "over"
for a whole block. The audit suggested marking only the first quad exercise of each day as priority, and ramping
0, 1, 1, 2, 2 instead of 0, 1, 2, 3, 3.

**Two seed oddities.** "Preacher Curl" and "Machine Curl" look like the same machine entered twice. The Bayesian
cable curl is a standing exercise, and your physio note says seated only.
