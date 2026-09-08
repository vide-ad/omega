#!/usr/bin/env bash
# Claude Code Stop hook: a ruling that reached this session must reach the repo before the turn ends.
# Blocks (exit 2) while docs/ has uncommitted changes or the branch is ahead of its upstream.
# Yields on its second firing (stop_hook_active) so it can never loop.
set -u
input=$(cat 2>/dev/null || true)
case "$input" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0;; esac
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0
dirty=$(git status --porcelain -- docs 2>/dev/null)
ahead=$(git log --oneline @{u}.. 2>/dev/null | wc -l | tr -d ' ')
[ -z "$dirty" ] && [ "${ahead:-0}" = "0" ] && exit 0
{
  echo "stop-check: decisions have not reached the repo yet."
  [ -n "$dirty" ] && echo "  uncommitted in docs/:" && echo "$dirty" | sed 's/^/    /'
  [ "${ahead:-0}" != "0" ] && echo "  $ahead commit(s) not pushed."
  echo "Commit and push before ending the turn (docs/PROCESS.md: a decision in a conversation is not recorded)."
} >&2
exit 2
