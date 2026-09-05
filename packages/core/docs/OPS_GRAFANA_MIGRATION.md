# OPS: Grafana / alert migration for the V1 → V2 metrics cutover

**Audience: whoever owns the OpenPanel dashboards and alerts. This is a written
spec, not a change. No dashboard, alert or datasource was edited by the work
that produced it — deliberately (M9 cutover discipline).**

Written for M9-002. Sources: `packages/core/src/metrics.ts` (the one registry),
`packages/core/src/http/http.metrics.ts`, `packages/core/src/jobs/jobs.metrics.ts`,
`apps/api/src/main.ts` (the ROLE table), and — for the V1 side —
`fastify-metrics@12.1.0/dist/fastify-metrics.js` and
`apps/worker/src/metrics.ts`.

> Where to put this file: it lives here because the task's scope globs cover
> `packages/**` and not a repo-root `docs/`. Move it to `docs/OPS_GRAFANA_MIGRATION.md`
> with one `git mv` if that is where you want it.

---

## 0. TL;DR — what a dashboard owner must do

1. **No metric name changes.** Every panel and alert keeps working by name.
2. **`route` label VALUES change** for a handful of routes (§2). Any panel or
   alert that pins `route="…"` for one of those needs its literal updated.
3. **Ten new `<queue>_*_count` series appear** (§3.1). Nothing to fix; you may
   want new panels.
4. **`buffer_add_*` for the replay, group and profile buffers steps up from
   near-zero** (§3.3). It looks like a regression on a graph. It is a fix.
5. **Bull-board moved** from `http://<worker>:3040/` to
   `http://<host>:<port>/bullboard`, and is now behind the dashboard session
   cookie (§4).
6. **`/metrics` is unchanged**: same path, same container port 3000, served in
   every ROLE.

---

## 1. Metric names and labels: unchanged, on purpose

`fastify-metrics` is deleted with Fastify (ADR-002). Its two route series are
re-created by one Elysia hook, reproducing the plugin's own definitions:

| Series | Type | Labels | V1 source | V2 source |
|---|---|---|---|---|
| `http_request_duration_seconds` | histogram | `method`, `route`, `status_code` | `fastify-metrics` default | `core/src/http/http.metrics.ts` |
| `http_request_summary_seconds` | summary | `method`, `route`, `status_code` | `fastify-metrics` default | same file |

Both still observe **seconds**, not milliseconds — a millisecond observation on
the same series would multiply every existing percentile by 1000, so it is
pinned by a test (`http.metrics.test.ts`).

Also unchanged in name and labels: the default process/GC metrics,
`job_duration_ms{name,status}`, `kafka_events_*_total`, the twelve `buffer_*`
series, the twelve session-lifecycle series, and the five
`<queue>_{active,delayed,failed,completed,waiting}_count` gauges.

`job_duration_ms` keeps its **failure-only** semantics: V1 observed it
exclusively in the workers' `failed` listener, so every percentile ever computed
from it is a percentile of failures. Success timings, if you ever want them,
must get a **new** series name.

---

## 2. The `route` label: same name, different values

This is the one thing that needs action.

**V1's rule:** the label was Fastify's `routeOptions.url` — the declared route
pattern *including* the plugin prefix, with Fastify's `:param` syntax.

**V2's rule:** the label is Elysia's `route` — the matched route pattern, with
Elysia's `:param` syntax.

The two syntaxes agree, so **most values are byte-identical**: every
`/insights/:projectId/...`, `/manage/...`, `/export/...`, `/import/events`,
`/track/device-id`, `/healthz/live` and so on carries the same literal it does
today. The differences are structural, and they are these:

### 2.1 Routes whose label changes

| What | V1 `route` label | V2 `route` label | Why |
|---|---|---|---|
| Track | `/track/` | `/track` | V1's label was `prefix` + the route `'/'`, giving a trailing slash. V2 declares the full path. |
| Profile | `/profile/` | `/profile` | same |
| Legacy event | `/event/` | `/event` | same (the route itself is KEPT — ADR-004/ADR-015 acceptance notes) |
| tRPC | `/trpc/:path` | `/trpc/*` | the fetch adapter derives the path by slicing the prefix, and a **batched** request puts commas in that segment, which `:path` cannot match (ADR-009) |
| OpenAPI UI | `/documentation` | `/openapi` | `@fastify/swagger-ui` → `@elysiajs/openapi` |
| OpenAPI document | `/documentation/json` | `/openapi.json` | same |
| Bull-board | *(separate worker port, `/`)* | `/bullboard`, and its sub-routes | §4 |
| Debug cron | *(separate worker port, `/debug/cron/:type`)* | `/debug/cron/:type` on the main port | §4 |

### 2.2 Routes whose label disappears

| V1 `route` label | Why it goes |
|---|---|
| `/misc/og/clear`, `/misc/favicon/clear` | deleted (removal register entry 6) |
| `/mcp` GET and DELETE | deleted (removal register entry 2); `POST /mcp` stays |
| the whole worker-side `/` bull-board tree on :3040/:3050 | merged onto the main port |

### 2.3 Behaviour at the edges, reproduced deliberately

| Case | V1 (`fastify-metrics`) | V2 |
|---|---|---|
| `HEAD` / `OPTIONS` | not measured (`methodBlacklist` default) | not measured |
| a request matching no route (404) | not measured (`registeredRoutesOnly` default true) | not measured |
| a handler that threw and was mapped to 5xx | measured — `onResponse` fires | measured — the hook is `onAfterResponse`, which likewise fires |
| status code grouping | ungrouped (`groupStatusCodes` default false) | ungrouped |

### 2.4 One thing this table cannot promise yet

At the time of writing, `main.ts` mounts only the **ops** surface; the dashboard
and public-API surfaces mount at M9-004, when the V1 Fastify boot is deleted.
The rules above are final, and §2.1 lists every difference in the route set that
exists today — but **re-read §2.1 against the M9-004 commit before you edit a
dashboard**, because that is the commit in which the values actually start being
produced.

Two route-set observations that belong to that commit, not to this one, and are
recorded here so they are not discovered from a graph:

* `packages/core/src/modules/tools/tools.routes.ts` declares `/site-checker`
  and `/ip-lookup` at the root, where V1 served them under the router prefix
  `/tools`. Whoever mounts the public-API surface has to restore the prefix;
  until then both the URL and the metric label would differ.
* `/manage/references*`, `/manage/projects/:projectId/dashboards*`,
  `POST /event`, `/healthcheck` and `/trpc/*` are still V1-only routes.

---

## 3. Series that appear, disappear, or change level

### 3.1 New: the queue gauges cover all seven queues

V1 registered `<queue>_{active,delayed,failed,completed,waiting}_count` for
**two** queues — `sessions` and `cron`. V2 registers them for all seven
(ADR-018's continuity register). **Ten new series**, none of the existing ten
changed:

```
notification_{active,delayed,failed,completed,waiting}_count
import_{...}_count
insights_{...}_count
gsc_{...}_count
cohortCompute_{...}_count
```

The `cohortCompute` spelling is intentional and permanent — the registry key
was NOT renamed (ADR-005 acceptance note), so `COHORTCOMPUTE_CONCURRENCY` keeps
working and the series name matches the queue.

### 3.2 Gone: the GroupMQ shard series

Removed with GroupMQ itself (ADR-004). Any panel or alert still selecting them
will read "No data" rather than error. Delete those panels.

### 3.3 Level change: `buffer_add_*` steps up

V1 installed the buffer *add* observers only inside the worker process, so every
API-side add — the replay, group and profile buffers on the `/track` path — was
invisible. V2 has one registry per process and every role builds the buffers, so
those adds now count.

**On a graph this looks like a regression at the cutover. It is a fix.** Expect
`buffer_add_*` for `replay`, `group` and `profile` to step up from near-zero;
`event` and `session` are already counted in V1 and should not move.

If you have an alert with an absolute threshold on any `buffer_add_*` series,
re-baseline it after the cutover.

### 3.4 Where each collector registers now

`/metrics` is served in **every** role, but not every role registers every
collector — a scrape-time gauge costs a Redis round trip per project, and ten
API replicas exposing the session gauges would multiply that Redis load for no
new information.

| Collector | `ROLE=api` | `ROLE=worker` | `ROLE=all` |
|---|---|---|---|
| default process metrics | yes | yes | yes |
| `http_request_*` | yes | yes | yes |
| `<queue>_*_count` | **no** | yes | yes |
| `buffer_*` | **no** | yes | yes |
| `sessions_active_total`, `sessions_projects_active`, `sessions_hwm_lag_ms` | **no** | yes | yes |
| `job_duration_ms`, `kafka_events_*` | declared, never observed | observed | observed |

**Consequence for a dashboard:** a panel that today sums a queue or buffer gauge
across every scrape target keeps working, because only the consuming replicas
ever exposed a non-trivial value. A panel that *asserts presence* on an API
target (e.g. `absent(buffer_event_count)`) will fire. Scope such alerts to the
consuming job.

---

## 4. Two URLs moved (deploy note, not a dashboard note)

The worker's second HTTP server is gone; one process serves one port in every
role (ADR-007).

| What | V1 | V2 |
|---|---|---|
| Bull-board | `http://<worker>:3040/` (and `:3050`), **unauthenticated on that port** | `http://<host>:<port>/bullboard`, **behind the dashboard session cookie** |
| Debug cron trigger | `http://<worker>:3040/debug/cron/:type` | `/debug/cron/:type` on the main port, still `NODE_ENV != production` only |
| `/metrics` | `:3030` (api), `:3040`/`:3050` (workers) | unchanged — same path, container port still 3000 |

Bull-board is mounted only when the role consumes **and** `DISABLE_BULLBOARD` is
unset (`'1'` and `'true'` are both still accepted as "disable"). It now returns
**401** rather than the UI to an unauthenticated caller.

Unchanged and deliberate: **pausing the `cron` queue from bull-board halts all
buffer flushing** (docs/ANSWERS.md §3 — "known!").

---

## 5. Checklist

- [ ] Search dashboards and alert rules for `route="/track/"`, `route="/profile/"`,
      `route="/event/"`, `route="/trpc/:path"`, `route="/documentation"` and
      update the literals per §2.1.
- [ ] Delete panels selecting the GroupMQ shard series (§3.2).
- [ ] Re-baseline absolute-threshold alerts on `buffer_add_*` for the replay,
      group and profile buffers (§3.3).
- [ ] Scope any `absent()`/`up`-style alert on a queue, buffer or session gauge
      to the consuming job only (§3.4).
- [ ] Optionally add panels for the five newly-covered queues (§3.1).
- [ ] Update the bull-board bookmark and tell operators it now needs a dashboard
      login (§4).
- [ ] Re-read §2.1 against the M9-004 commit before editing anything (§2.4).
