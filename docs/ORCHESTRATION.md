# Agent orchestration

Four agents: **Tempo** (PM, this cloud session on claude.ai/code), **Mac coder**, **PC coder**, **PC back-end**.
One human, mostly on a phone. Researched September 2026; sources are in the session transcript.

## The short version

- **Slack is fine as a notification sink, poor as a task bus.** It has no claim/state semantics, threads get
  noisy, Claude-in-Slack on Pro/Max spawns a fresh cloud session per @mention (it does not talk to your Mac/PC
  agents), Claude Tag needs Team/Enterprise, and Anthropic's own docs warn Claude may follow instructions from
  other messages in a thread. Keep it for "PR #12 is ready" pings if you like it; do not run tasks through it.
- **"agent-bridge" is not one thing.** At least four unrelated GitHub projects use the name. The most-starred
  (quilin-ai/agent-bridge, ~330 stars) bridges Claude Code and Codex *on the same machine* over a local
  websocket, Windows unsupported. suneel944/agent-bridge is Linux-only and single-machine. firstintent/a2a-bridge
  is a multi-protocol daemon that can cross hosts but is young (9 stars). catatafishen/agentbridge is a JetBrains
  plugin. **If you have a specific one in mind, tell me the repo and I will evaluate it against the plan below.**
- **The native channel exists now:** Claude Code cross-session messaging (`ListAgents` / `SendMessage`,
  CLI ≥ 2.1.224, native Windows ≥ 2.1.234) reaches sessions on other machines through Anthropic's servers while
  those machines are connected with `claude --remote-control`, and any machine can push a message into this cloud
  session with `claude -p "…" --cloud <session-id>`. Caveats: plain text only, best-effort ("delivery is not
  guaranteed"), an open Windows bug (anthropics/claude-code#86014) where sends report success but never arrive,
  and inbound messages are held unless the worker runs with `crossSessionInbound: accept`.

So: **git and GitHub are the bus; messaging is only a nudge.**

## Protocol

1. **Tasks live in GitHub Issues** on `vide-ad/omega`, one per unit of work, labelled by lane:
   `lane:web` (Mac), `lane:api` (PC back-end), `lane:core` (PC coder), `lane:pm`. Tempo writes them with
   acceptance criteria and the files each touches. Workers never self-assign across lanes.
2. **One branch, one PR per issue**: `lane/<lane>/<issue>-<slug>`. PR body says `Closes #N` and lists what was run.
   Draft PR early so Tempo can see progress; mark ready when CI is green.
3. **Directory ownership is strict** (see `docs/LANES.md`). A PR that touches another lane's directory is
   rejected unless the issue says so. Two agents on the same Windows machine use separate git worktrees.
4. **CI is the gate**: `.github/workflows/ci.yml` runs typecheck + tests + builds on Ubuntu and Windows.
   `main` is protected: CI required, squash-merge only.
5. **Done = PR ready + CI green + a one-line message to Tempo.** Preferred nudge from a worker machine:
   `claude -p "PR #N ready for review" --cloud <tempo-session-id>` (session id is in this document's footer once
   the user pins it). Fallback: nothing — Tempo is subscribed to PR activity on the repo and wakes on PR events.
6. **Tempo reviews** (reads the diff, runs CI, checks the spec), requests changes or approves, then asks the
   human to merge from GitHub mobile. Tempo never merges on its own.
7. **Deploys** go from merged `main` only, by the PC back-end lane running `deploy/deploy.sh` on the droplet
   (or a GitHub Action with an SSH key, once the human wants that).
8. **Contracts are frozen in code**: `packages/core/src/api-types.ts` and `docs/API.md`. Changing them is a
   `lane:pm` issue; both sides update in the same PR series.

## What each worker runs

```
# once per machine
claude --remote-control            # lets the phone steer it and lets Tempo message it
# work loop (in the repo, on its lane branch)
/loop 10m "check gh issues labelled lane:<mine> and unassigned-to-me PR review comments; pick the oldest; work it to a green PR"
```

Workers need: `gh` authenticated, pnpm 10.33 (corepack), Node ≥ 22.12, and for the Mac lane Xcode's iOS
Simulator + a physical iPhone with Safari Web Inspector.

## Tempo's tools in this session

- `subscribe_pr_activity` → PR comments, CI failures and check-suite results wake this session.
- `create_session` → can spawn extra cloud workers for parallelisable core/API tasks when the laptops are busy.
- `send_later` / Routines → scheduled check-ins (e.g. nightly "review open PRs").
- `watch_url` → an inbound webhook if you want the droplet to report deploy status.
