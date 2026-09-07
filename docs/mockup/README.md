# Interactive mockup

`omega-mockup.html` — a single self-contained file. Open it in a browser; no server, no build, no
network beyond the Google Fonts stylesheet. Narrow the window to ~390px (or open it on a phone) to
see it as intended.

**What it is.** The five screens of the app — Today, Session, Readiness, Volume, History — with the
prescriptions, reason codes and rationale strings taken from the **real engine output** (verified
against a live server on a freshly seeded database). The sessions behind those numbers are invented,
and the page says so.

**What is interactive.** RIR chips, the four-state pain flag, the warmup toggle, logging a set
(which starts the rest timer), the `WHY` disclosure on every exercise, the readiness scales, and the
bottom navigation.

**What it is not.** Not the shipping UI — that lives in `apps/web` and is built with React. This file
is a design surface for review and argument, deliberately dependency-free so anyone can open it.
Changes made here are not changes to the app; they have to be carried across to `apps/web` by the
web lane.

## For review

Worth an opinion on:
- The **brass = the engine's voice** convention. Every prescribed number is brass; records are chalk.
  Does that hold up, or does it read as decoration?
- **Colour is semantic only** — no accent hue, just brass for prescriptions, slate for injury
  constraints, and moss/amber/brick for volume status. Fitness apps are usually neon; this is a
  deliberate refusal. Is it too austere?
- The **session card density**. Each exercise carries a name, target line, reason chips, last
  session's numbers, a prescription with a disclosure, sometimes a physio note, then set rows.
  That is a lot above the fold on a 390px screen. What earns its place and what does not?
- The **set row ergonomics** at arm's length, one-handed, mid-set. Tap targets are 44px+ but the
  weight/reps inputs and the RIR row compete for the same thumb.
- Whether **`Set a starting load`** (the `first_time` case, e.g. the squat) reads as a prompt or as
  an error.

The type is Archivo (display), Barlow (body) and IBM Plex Mono (all figures and the chalk string).
