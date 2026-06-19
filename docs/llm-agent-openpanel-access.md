# LLM agent access to OpenPanel session data

**Status:** Proposed
**Owner:** Ayush
**Audience:** Frameo-cat (Hermes/Claude Slack agent) and future internal agents

## Why

Today when someone asks `@frameo-cat` "what did user X do in their last session?"
the agent can't answer — OpenPanel data is locked behind the dashboard. Anyone
debugging a user report has to manually pivot from Slack to the OpenPanel UI,
find the session, watch the replay. The agent should be able to do this for
us: look up a user's sessions, summarise what happened, and surface the
dashboard URL if a human still wants to watch.

## What we expose

Three read-only HTTP endpoints in `apps/api` (openpanel-forked), bearer-token
authenticated. They wrap existing service methods — no new ClickHouse queries.

| Endpoint | Returns | Underlying call |
|---|---|---|
| `GET /api/v1/agent/users/:fbUid/sessions?limit=20` | Session metadata + dashboard URL per row | `getSessionList({ profileId })` |
| `GET /api/v1/agent/sessions/:id/events` | Track-event timeline (session_start / screen_view / custom) | `getEvents({ sessionId })` |
| `GET /api/v1/agent/sessions/:id/replay-chunks?from=0` | Raw rrweb event JSON (typed) | `getSessionReplayChunksFrom()` |

Auth: `Authorization: Bearer <token>`. `AGENT_API_KEYS` env var holds the
comma-separated allow-list; each agent gets its own key so we can revoke
individually.

Rate-limit: 30 req/min per key. Each CH query gets `max_execution_time=30`.

## How the agent uses it

The reconstruction logic stays out of the API and lives in the agent's
context. We add a new section to `SOUL.md` in `infra/kubernetes/deployments/frameo-cat.yaml`
mirroring the existing Databricks / GitHub / Slack blocks:

- Curl recipes for the three endpoints (with `$OPENPANEL_API_KEY` in env)
- rrweb event-type cheat sheet (type 2/3/4/5; sources 0/2/5)
- Recipe: walk chunks by `chunk_index`, walk events by `timestamp`, emit one
  line per Meta/Click/Input/Custom, skip Mutations (animation noise)
- Reminder: always surface
  `https://openpanel.dashverse.ai/dashverse/frameo/sessions/<sid>` so a human
  can fall back to watching if the text summary isn't enough

The agent does the parsing in its own reasoning — same pattern as how it
already reads Slack history or runs SQL on Databricks.

## What the agent will see

The current frameo-pro SDK runs with `maskAllInputs: false, maskAllText: false`,
so rrweb captures everything visible on the page plus all typed input. The
agent can answer:

- Which URL the user was on at any timestamp
- Every click (with the element's tag/class/text resolved from the latest
  FullSnapshot)
- Every keystroke / final input value
- DOM mutations — what text appeared on screen, error toasts, modal contents
- Custom events the SDK explicitly emitted

It cannot see cross-origin iframes, canvas pixel data, raw audio, or network
calls (these aren't in the rrweb stream).

## Phases

1. **Phase 1 — API routes (openpanel-forked).** Add `agent.router.ts` with
   the three endpoints + bearer auth. ~50 LOC. PR + deploy `openpanel-api`.
2. **Phase 2 — Agent context (infra).** Add `OPENPANEL_API_KEY` to the
   `frameo-cat` secret. Add the curl + schema block to `SOUL.md`. Roll out.
3. **Phase 3 (optional) — Summarize endpoint.** If raw chunks blow the
   token budget on long sessions, add `GET /sessions/:id/summary` that runs
   the rrweb parser server-side and returns text. Defer until we see real
   usage requiring it.
4. **Phase 4 — Privacy guard (frameo-pro).** Before public rollout, set
   `maskInputOptions: { password: true }` in the SDK config so password
   fields aren't stored in CH or read by the agent.

## Risks

- **Token leak.** Per-agent keys + quarterly rotation. Never put the key in
  user-facing prompts.
- **CH load from runaway agents.** Per-key rate limit + per-query timeout.
- **PII exposure.** Phase 4 password mask before public rollout; document
  internally what the agent can see in any session.
- **Long-session token explosion.** Default `replay-chunks` to first 5
  chunks; agent paginates explicitly via `?from=N`. Phase 3 endpoint
  is the long-term fix.

## Out of scope

- Building an `openpanel-mcp.js` server. Possibly nice later, but the
  curl-in-SOUL pattern is already proven for Databricks/Slack/GitHub access.
- Cross-project access. Hardcoded to `project_id='frameo'` for now; expose
  a `:projectId` param if a second project's agent ever needs this.
- Mirroring `sessions` / `session_replay_chunks` to Databricks. The agent
  reads CH directly through the API — no sync pipeline needed.
