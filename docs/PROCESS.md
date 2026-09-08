# How Omega is run

Adopted from wren's review of 8 Sep, which distilled what North paid for. Each rule below cost something.

## The boundary

**Chalk can rule on anything the repository can settle. Chalk cannot rule on anything only David's preferences
can settle.**

Two contradictory sections, one incoherent → the repo settles it: fix, log, move on. "Should a lifter who won't
tap a chip ever get load progression?" → nothing in the codebase answers that; it belongs to David even though
chalk is better placed to see its consequences. The failure mode this closes: mistaking a decision you are
*equipped* to make for one you are *entitled* to make. `docs/ENGINE-RULES.md` separates forced deviations from
chosen ones for exactly this reason, and the chosen ones sit in `docs/DECISIONS-FOR-DAVID.md` until he rules.

## The loop

1. **Chalk drafts** the spec (single-owner feature) or contract (a seam — two or more parties building against one
   interface, or a place where failure is silent or expensive).
2. **Code-reality check.** The coder reads the draft against the actual repo before it is build-ready. On North
   this was the single highest-value step adopted and caught something real in both contracts it was applied to.
   Chalk can partly self-serve it — the repo is readable — but a second reader still catches things.
3. **Build-ready is a state, not an opinion.** Nothing is built from a document that has not passed step 2.
4. **Changes are numbered amendments with a stated reason.** Never a silent edit. The number is what makes
   staleness detectable.
5. **Verification is risk-triggered:** migrations, anything touching stored data, auth boundaries, anything where
   failure would be silent. Not every text change.
6. **Contracts for seams, specs for single-owner features.** Keeping that boundary is what stops the process
   becoming paperwork.

## Rules with their price tags

- **The code is canonical, not the document.** North's sync contract listed six tables from memory; the schema
  had nine, and the missing one would have broken the first sync on a new device. Audit the document against the
  built thing, not the other way round.
- **A decision that exists only in a conversation has not been recorded.** North's designer built a whole colour
  system on a palette reversed weeks earlier, because two committed documents still described the old one; the
  sync contract sat eight amendments behind the server for three weeks. *Whoever receives a ruling writes it to
  the repo in the same session.* The Stop hook below makes this mechanical.
- **Conditions must land as tests, not prose.** "This column must never be a merge surface" was written in a
  message, ignored, and the bug corrupted five weeks of data invisibly. A condition without a test is decoration.
- **A harness replaying its own protocol proves consistency, not correctness.** 41 passing tests against a fake
  client; the first real handshake found wire-shape mismatches the suite could not see by construction. Drive the
  built client against the live server. That standard was met once on Omega; hold it.
- **The expensive bugs are invisible from every client.** Four of North's were — every client behaved, the data was
  wrong anyway. All four were found by reading production data and wire traffic. Budget time for looking at what
  the system actually did.
- **Route decisions to whoever can settle them.** A three-week stall on North came from sending a product
  judgement to David when it was the PM's to make. Nothing was blocked, so nobody noticed.
- **Persist yourself in the repository.** North lost an agent to a malware wipe with nothing off the machine;
  rebuilding him from commits and chat took two agents a day and got it wrong. Memory holds *how to work here*;
  the repo holds *what was decided*.
- **Server capability lands before the client sends.** A client pushed to a table the server didn't know; it was
  acked and dropped. Ordering is the defence; making the drop loud is the backstop.

## Mechanical enforcement

Two hooks, set up because they are cheap here and would have saved North months. Both live in `tools/hooks/`;
run `git config core.hooksPath tools/hooks` once per checkout.

- **`pre-commit` — secrets.** Matches the *shape* of a credential, never the word: a repo full of legitimate prose
  about tokens would trip a word-matcher, and a hook that cries wolf is disabled within a week. Scans only added
  lines, so removing a leaked secret is never blocked by the secret itself. Censors what it prints.
- **`stop-check.sh` — decisions reach the repo.** A Claude Code `Stop` hook (`.claude/settings.json`) that refuses
  to end a turn while `docs/` has uncommitted changes or the branch has unpushed commits. That is "a ruling
  received must be written down in the same session" made mechanical. It yields on its second firing so it cannot
  loop.

## Retrospectives

Every handover carries a "what I got wrong" section, with what each mistake cost. The one in
`docs/HANDOVER-WREN.md` §5 is the reason the rest of that document was taken at face value. Keep writing it.
