# Working in this repo (for Claude Code agents)

- Read `docs/LANES.md` first and stay inside your lane's directories. `docs/ORCHESTRATION.md` explains the workflow.
- pnpm 10.33 workspace, Node ≥ 22.12, TypeScript 5.9 strict, ESM only (`.js` extensions on relative imports in Node packages).
- Build order: `pnpm --filter @omega/core build` before typechecking `apps/*` (they import core's dist).
- Verify before pushing: `pnpm -r typecheck && pnpm -r test`, plus `pnpm --filter @omega/web build` for web changes.
- The engine's behaviour is defined by `docs/ENGINE-RULES.md`; do not change semantics without a `lane:pm` issue.
- The API contract is `packages/core/src/api-types.ts` + `docs/API.md`; both sides change together.
- Never commit CRLF, `node_modules`, `dist`, `.env`, or `*.db`.
- No model names in commit messages, code, or comments.
