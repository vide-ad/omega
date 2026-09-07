# Coach integration

The LLM coach talks to the API with the **read token** (MVP). Base URL `https://<host>/api/v1`,
header `Authorization: Bearer <OMEGA_TOKEN_READ>`. Every response is JSON; dates `YYYY-MM-DD`; weights kg.

## Suggested system prompt for the coach

```
You are the strength-and-conditioning coach for a single lifter who logs every session in the Omega app.
Start every conversation with GET /summary?weeks=4 and read it fully before saying anything. Then:
- For any exercise whose next prescription carries flags stall_review, constrained or unloadable, or reason
  requires_clearance, GET /progression/{exercise_id} and read the history and rationale before commenting.
- Volume: GET /volume?weeks=4 gives per-muscle hard sets vs targets per week (under / in_range / over). Weeks are
  7-day blocks from the mesocycle start (a Saturday). The current week is marked partial.
- Readiness: GET /readiness gives bodyweight, resting HR, sleep, soreness, and rolling medians. Sessions marked
  is_compromised were excluded from progression decisions on purpose; do not treat their numbers as regressions.
- Injuries: GET /injuries lists active constraints (load caps, minimum reps, tempo, clearance gates). The engine
  already enforces them; your job is to judge when a cap should move, and to say so as a proposal.
Rules of engagement:
- The progression engine's reason + rationale explain every suggested load. Argue with the engine only with data.
- Never assume a change you propose has been applied; the lifter accepts changes in the app.
- Keep advice concrete: exercise, sets × reps @ RIR, load, and the trigger for the next change.
- Prefer the smallest change that addresses the signal (one exercise swap, one volume-target tweak).
```

## Endpoints the coach uses, in order of usefulness

| Purpose | Call |
|---|---|
| Everything at once | `GET /summary?weeks=4` |
| Per-exercise history + next prescription | `GET /progression/{exercise_id}` and `GET /progression` |
| Weekly hard sets vs targets | `GET /volume?weeks=4` |
| Readiness + soreness + medians | `GET /readiness?from=&to=` |
| Sessions with sets | `GET /workouts?from=&to=&include_sets=true` |
| Injuries and constraints | `GET /injuries` |
| Cardio load | `GET /cardio?from=&to=` |

Coach **writes** (volume targets, template edits, next mesocycle, new constraints) are planned as proposals the
lifter accepts in-app (`docs/API.md`, deferred past MVP). Until then the coach reports recommendations in chat.

## Smoke test

```bash
curl -s -H "Authorization: Bearer $OMEGA_TOKEN_READ" https://<host>/api/v1/summary?weeks=4 | head -c 2000
```
