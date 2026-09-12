# Benchmark harness — saturation sweep

How to find the **max sustainable ingest throughput** of OpenPanel V2: the rate
at which the Kafka consumer starts falling behind and does not catch up.

The harness is three files under `apps/api/e2e/`:

| File | Role |
|---|---|
| `session-stress.ts` (`bun run e2e:sessions:stress`) | one rung. Emits load, drains to completion, reconciles ClickHouse, and reports latency, api/worker RSS+CPU, Kafka lag, and every queue/buffer depth. |
| `saturation-sweep.ts` (`bun run e2e:saturation`) | the ramp driver. Runs `session-stress.ts` across a ladder of offered loads, one child process per rung, applies the knee definition and prints a verdict. |
| `metrics-monitor.ts` | the `/metrics` scraper the queue and buffer numbers come from. |

`process-monitor.ts` (RSS/CPU) and `lag-monitor.ts` (Kafka consumer-group lag)
are BENCH-001's and are used unchanged.

---

## Running it

The dev stack must be up and **must share `SESSION_TIMEOUT_MS` with the
harness** — `.env` sets `4000`, and both sides read it through
`dotenv -e ../../.env`. With the real 30-minute default every rung would sit in
`drain()` for half an hour.

```bash
# stack (operator keeps this running; no --watch)
cd apps/api && API_PORT=3333 bun run dev

# full sweep — the operator run, no agent time limit
cd apps/api
E2E_WORKER_URL=http://localhost:3333 \
  SWEEP_LADDER=25,50,100,200,400,800 \
  E2E_SESSIONS=2000 E2E_EVENTS_PER_SESSION=3 \
  bun run e2e:saturation

# short proof that the driver works (this is what M16-001 ran)
E2E_WORKER_URL=http://localhost:3333 \
  SWEEP_RUNGS=2 E2E_SESSIONS=20 E2E_EVENTS_PER_SESSION=2 \
  timeout 900 bun run e2e:saturation
```

Budget roughly `E2E_SESSIONS x E2E_EVENTS_PER_SESSION / offered-rate` seconds of
emit plus ~25 s of fixed drain/reconcile per rung (the 6 s idle wait, the reaper
loop and the reconcile stability window dominate at small sizes).

---

## Env knobs

### The sweep (`saturation-sweep.ts`)

| Variable | Default | Meaning |
|---|---|---|
| `SWEEP_RUNGS` | `5` | number of rungs to climb |
| `SWEEP_LADDER` | — | explicit ladder, e.g. `25,50,100,200`. Wins over start/factor; truncated to `SWEEP_RUNGS` |
| `SWEEP_START_CONCURRENCY` | `25` | first rung's concurrency when no explicit ladder |
| `SWEEP_CONCURRENCY_FACTOR` | `2` | geometric step between rungs |
| `SWEEP_AUTH_MODE` | `secret` | which ingest auth path every request takes: `secret` \| `cors` \| `bypass` |
| `SWEEP_WARM_REQUESTS` | `3` | authenticated requests sent and discarded before each rung records |
| `SWEEP_RUNG_COOLDOWN_MS` | `5000` | idle gap between rungs |
| `SWEEP_RUNG_TIMEOUT_MS` | `600000` | per-rung wall clock before the child is SIGKILLed and recorded as `no-result` |
| `SWEEP_DRAIN_GROWTH_FACTOR` | `1.5` | knee clause 2, relative |
| `SWEEP_DRAIN_GROWTH_MIN_S` | `2` | knee clause 2, absolute floor (seconds) |

### Per rung (`session-stress.ts`, passed through by the sweep)

| Variable | Default | Meaning |
|---|---|---|
| `E2E_SESSIONS` | `500` | sessions per rung |
| `E2E_EVENTS_PER_SESSION` | `3` | events per session; each session also produces a synthetic `session_start` and `session_end` |
| `E2E_CONCURRENCY` | `25` | in-flight sessions — **the sweep overrides this per rung** |
| `E2E_AUTH_MODE` | `bypass` | as `SWEEP_AUTH_MODE`; the standalone default stays `bypass` so the pre-existing suites keep the path they were written against |
| `E2E_AUTH_WARM_REQUESTS` | `3` | discarded warm-up requests; `0` disables warming |
| `E2E_DRAIN_TIMEOUT_MS` | `120000` | reaper/flush loop budget |
| `E2E_RECONCILE_TIMEOUT_MS` | `30000` | ClickHouse count-settling budget |
| `E2E_NO_SAMPLING` | `0` | `1` skips the process, lag **and** metrics monitors — the control lever for "is the 1 Hz sampling itself costing throughput" |
| `E2E_RUNS` | `1` | BENCH-001's repeat mode. Not used by the sweep |
| `E2E_API_URL` / `E2E_WORKER_URL` | `http://localhost:3333` / `http://localhost:9999` | stack endpoints |
| `SESSION_TIMEOUT_MS` | from `.env` (`4000`) | must match the running stack |

---

## The three auth paths — and which one each number came from

`validateIngestRequest`
(`packages/core/src/modules/ingest/src/client-auth.ts`) can clear a request
three different ways, and they are **not** the same amount of work. Every
number this harness prints is labelled with the mode it ran under, on the rung
line and again in the verdict block.

| Mode | What the request carries | What the API does | Real traffic? |
|---|---|---|---|
| `bypass` (a) | client id of the `ignoreCorsAndSecret` fixture client | returns at `client-auth.ts:197` immediately, before any I/O | **No.** Diagnostic baseline only |
| `cors` (b) | client id of the real-secret client + an allowed `Origin` | returns at `client-auth.ts:200` after a regex against the project CORS list | Yes — browser / web-SDK traffic |
| `secret` (c) | client id + `openpanel-client-secret` header, no `Origin` | `client-auth.ts:205`'s `getCache(...)` around a scrypt `verifyPassword` | Yes — server-side SDK traffic |

**`secret` is the headline number and the sweep's default**, because a
self-host capacity claim should be the pessimistic one. `cors` is the second
data point. `bypass` exists only so the (a)↔(c) delta isolates what the auth
path costs; no production request takes it.

Both clients are created by `ensureFixtures()` in `apps/api/e2e/lib.ts`, on the
same project:

- `e2e1e2e1-…-000000000001` — the pre-existing bypass client, unchanged, so the
  29 checks in `e2e:sessions` keep passing.
- `e2e1e2e1-…-000000000002` — new. Carries a real scrypt secret in
  `salt.hashKey` form, hashed with `hashPassword` (the `@openpanel/shared/server`
  scrypt helper, reached through its re-export on the `@openpanel/core` barrel —
  `apps/api` does not declare `@openpanel/shared` and adding it would move
  `bun.lock`, which M16-001 could not touch).

The project's `cors` list is set to `e2e.test` so path (b) is reachable. That
changes nothing for the bypass client, which returns before the CORS check.

---

## Cache warming: why the 300 s TTL is not saturation

`verifyPassword` is **scrypt** (`packages/shared/src/server/crypto.ts:40`,
keyLength 32, `timingSafeEqual`) — tens of milliseconds of CPU per call. It is
shielded by `VERIFY_CACHE_SECONDS = 300` (`client-auth.ts:34`), keyed on client
id plus the base64 of the presented secret. So **a scrypt is a latency outlier,
not a per-request cost**: a rung shorter than the TTL pays it once, at whatever
moment it lands; a rung longer than the TTL pays it periodically. Read naively,
one such spike inside a measured window looks exactly like a knee.

What the harness does about it:

1. **Warm before recording, every rung.** `warmAuth()` in `session-stress.ts`
   sends `E2E_AUTH_WARM_REQUESTS` (default 3) fully authenticated requests and
   **discards them** — they are not in the latency series and not in the
   reconcile counts (they use a dedicated `203.0.113.7` source ip, outside the
   `100.x` space the measured sessions use). Only then does `emit()` start
   recording. Each rung is a fresh child process, so this happens identically at
   every rung.
2. **Print the warm-up latencies**, so it is visible where the scrypt landed.
3. **Probe the outlier's size directly**, once per sweep, before the ladder:
   `probeAuthCost()` sends one request with a secret that has never been
   presented — guaranteeing a miss in both cache layers and therefore a real
   scrypt, which then refuses with 401 — and one request on the warmed real
   secret. The delta is what a mid-rung expiry would have injected.

**How this was confirmed** (runs 2026-09-12, this box, rev `8175c3f4`): the
sweep's own output shows the split. On one rung the warm-up latencies came back
as `45.5 / 2.9 / 4.1 ms` — the first discarded request paid the scrypt, the next
two did not, and the measured window that followed had a P99 of 58.9 ms with no
40 ms outlier in it. **That three-number split is the load-bearing evidence**,
because it shows the scrypt inside the warm-up and its absence afterwards, on
the same rung.

The standalone `probeAuthCost()` figure is a useful order-of-magnitude check but
is a single unpaired sample and is itself noisy: across four sweeps it measured
cold `37.0 / 37.4 / 53.1 / 57.9 ms` against warmed `3.4 / 2.8 / 10.3 / 47.6 ms`,
i.e. a delta of 34.6, 34.6, 42.8 and 10.3 ms. The 10.3 ms reading is the probe
landing while the box was still busy, not a cheaper scrypt — treat the probe as
"tens of milliseconds, same order as a whole rung's P99" and not as a
calibrated constant.

One caveat, stated plainly. `getCache` is called with `useLruCache`
(`client-auth.ts:205`), so the verdict is held in a **process-local LRU as well
as in Redis** (`packages/redis/cachable.ts:22`). The harness can delete the
Redis copy — the sweep does, once, before the ladder — but it cannot reach the
API process's L1. The per-rung warm-up, not that delete, is what guarantees the
measured window is scrypt-free.

---

## The knee, as implemented

`classifyRung()` in `saturation-sweep.ts`. A rung **did not drain** if any of:

1. `lag.secondsToZeroAfterEmitEnd` is `null` — the Kafka consumer group was
   still behind when sampling stopped.
2. That figure **grew rung-over-rung rather than staying flat**: more than
   `SWEEP_DRAIN_GROWTH_FACTOR` × the best drain time seen so far on a rung that
   did drain, **and** more than `SWEEP_DRAIN_GROWTH_MIN_S` seconds worse in
   absolute terms. The absolute floor is what keeps 0.4 s → 0.9 s from reading
   as a knee.
3. **A queue depth or a buffer pending count failed to return to zero** — any
   `*_waiting_count` / `*_active_count`, or any `buffer_*_count`, that never
   reads 0 in any scrape at or after emit-end.

The first such rung is the knee. **The last rung before it is the max
sustainable throughput**, reported in events/second together with that rung's
api and worker CPU and RSS and its /track P50/P95/P99.

Two deliberate exclusions from clause 3:

- `*_delayed_count` is ignored. The cron queue permanently parks its next
  scheduled run there; a delayed job is steady state, not a backlog.
- "returned to zero" is asked of the **whole post-emit window**, not of the last
  scrape, because the cron queue picks up a scheduled job every minute
  regardless of load and a final scrape that lands on one is not a backlog.
  `*_failed_count` is reported as a delta over the run but is **not** a knee
  clause.

**A rung that fails to drain is a data point, not a harness error.** It is
recorded, the ladder stops climbing, and the sweep still exits 0. The sweep
exits non-zero only if it measured nothing at all. A rung that hangs is
SIGKILLed at `SWEEP_RUNG_TIMEOUT_MS` and recorded as `no-result`.

---

## What is sampled, at ≥1 Hz, for the whole run

| Source | What |
|---|---|
| `process-monitor.ts` (`/proc`) | api and worker RSS (kB→MB) and CPU% — peak and steady-state (median) |
| `lag-monitor.ts` (Kafka admin API) | consumer-group lag on the events topic — peak, lag at emit-end, seconds-to-zero after emit-end (`null` = still draining) |
| `metrics-monitor.ts` (`GET /metrics`) | per queue: `*_waiting_count`, `*_active_count`, `*_delayed_count`, `*_failed_count`. Per buffer: `buffer_*_count` pending, `buffer_event_pending_local_count`, and the run-deltas of `buffer_flush_rows_total`, `buffer_flush_duration_ms`, `buffer_ch_insert_duration_ms` |
| in-request | /track latency P50/P95/P99, **emit phase only** |

Queues covered on this tree: `sessions`, `cron`, `notification`, `import`,
`insights`, `gsc`, `cohortCompute`. Buffers: `event`, `event-pending-local`,
`profile`, `profile-backfill`, `session`, `replay`, `group`, `bot`.

Scraping was chosen over reaching into Redis or the buffer objects **because V1
exposes the same endpoint**: the identical sampler will work against V1 when the
comparison run happens, with no second implementation to keep honest.

---

## SMOKE RESULT — not a capacity claim

> **These numbers are not a benchmark.** They come from the bounded proof runs
> M16-001 ran to show the driver works. 20–100 sessions is far too small, the
> ladder is two rungs, and no rung ever saturated anything. They are recorded
> only so the harness's output shape is on the record and the next operator can
> tell a regression in the *tooling* from a change in the *system*.

**Labelling.** rev `8175c3f420ae5aaba327f9d6fbe6b7657d0b43d6` (`rewrite/v2`);
2026-09-12, ~07:00 UTC; 4 vCPU AMD EPYC-Milan, 15 GiB RAM, no swap, Linux
6.8.0-137; Bun 1.4.0; local single-node Postgres / Redis / ClickHouse /
Redpanda. All figures are **per process**, from `/proc/<pid>`, never whole-box.
RSS is in MB (uncompressed, resident). Latency is milliseconds, wall clock,
client-side round trip including the harness's own `fetch` overhead.

### The verification sweep — `SWEEP_RUNGS=2 E2E_SESSIONS=20 E2E_EVENTS_PER_SESSION=2`, auth path (c)

| rung | concurrency | ev/s | P50 | P95 | P99 | api CPU peak | api RSS peak | Kafka peak lag | drain | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 25 | 519.5 | 29.7 ms | 51.5 ms | 53.5 ms | 23.0 % | 552 MB | 1 | 0.9 s | drained |
| 2 | 50 | 540.5 | 29.4 ms | 50.8 ms | 52.7 ms | 21.0 % | 550 MB | 1 | 0.9 s | drained |

Verdict printed: *knee NOT REACHED — every rung drained*. Correct, and exactly
why it is not a capacity number: at this size the whole emit phase finishes in
under 100 ms, which measures the harness's ramp, not the pipeline's ceiling. An
earlier identical sweep gave 347.8 and 459.8 ev/s for the same two rungs — a
~50 % spread on the same command, on the same tree, minutes apart. That spread
is the real message of this table.

It also exercised the "returned to zero" rule the knee depends on: rung 2 caught
the cron queue with `active=1` mid-scrape and `final=20`, and was still
correctly classified `drained`, because the rule asks the whole post-emit window
rather than the last scrape.

### The three auth paths — one rung each, concurrency 25, 100 sessions × 3 events

| path | ev/s | P50 | P95 | P99 | api CPU peak | api RSS peak |
|---|---|---|---|---|---|---|
| (a) `bypass` | 508.5 | 46.7 ms | 58.7 ms | 80.0 ms | 92.9 % | 636 MB |
| (b) `cors` | 550.5 | 43.9 ms | 49.0 ms | 67.4 ms | 73.9 % | 647 MB |
| (c) `secret` | 635.6 | 37.9 ms | 42.3 ms | 61.3 ms | 64.0 % | 630 MB |

**Read this as "no measurable auth-path delta at this size", not as "the secret
path is faster".** The ordering is monotonic in *run order*, not in work done,
which is the signature of a warming box rather than of a real effect; 300
requests per mode on a 4-vCPU box shared with the stack under test cannot
resolve a difference this small. The (a)↔(c) delta the sweep exists to isolate
needs the full operator run.

There is a mechanical reason to expect the delta to be small, which is worth
recording because it contradicts the premise the harness was commissioned under
("a cache round-trip per request that the bypass does not do"). **After the
first hit, neither cache in the auth path touches Redis.** `getCache` is called
with `useLruCache` and returns from a process-local LRU before any Redis call
(`packages/redis/cachable.ts:22-27`), and `getClientByIdCached` is a
`cacheablePerDb`, which holds its own L1 too. So within the 300 s TTL the extra
work the secret path does is one in-process map lookup, not a network round
trip. Whether that holds at 5,000 events/s — where the LRU's `max: 5000` is
shared across every `getCache` caller and eviction becomes possible — is
precisely what the full sweep would answer. **This is a finding, not a change:
no application source was touched.**

---

## What these numbers do NOT cover

- **No V1 comparison.** `verification/benchmarks/02-api-throughput.md` and
  `03-clickhouse-queries.md` are still BLOCKED with no V1 number. The comparison
  is a separate follow-on; `lindesvard/openpanel-api:2` is published, so V1 can
  be pulled as an image rather than built, and `main` is frozen at the fork point
  `663959db`, which makes it a clean comparator.
- **api and worker are the same process here.** The dev stack runs `ROLE=all`,
  and the verification command points `E2E_WORKER_URL` at the api's own port, so
  `process-monitor` resolves the same pid twice and the api and worker rows are
  **identical by construction**. They are not two independent measurements. To
  separate them, boot two processes (`ROLE=api` and `ROLE=worker`) on distinct
  ports and point `E2E_API_URL`/`E2E_WORKER_URL` at each.
- **Single node.** One Postgres, one Redis, one ClickHouse, one Redpanda, all on
  the same 4-vCPU box as the load generator and the API. Production is 2 shards ×
  2 replicas (`/home/deploy/rewrite-openpanel/docs/ENVIRONMENT.md`). Nothing here
  is a Cloud per-node prediction, and the load generator competing for the same
  4 cores is itself a ceiling.
- **Not a fixed-rate load test.** The driver ramps *concurrency*, so offered load
  is closed-loop: it falls as latency rises, which is the opposite of what an
  open-loop generator does at saturation. It finds the drain knee, which is what
  was asked for; it does not produce a "requests/s at fixed rate" curve.
- **Latency is emit-phase only** and includes client-side `fetch` overhead. It is
  not a server-side histogram; `http_request_duration_seconds` on `/metrics` is.
- **The 1 Hz `/metrics` scrape costs the measured process something.** It is
  ~2,700 lines per scrape. Set `E2E_NO_SAMPLING=1` for a control run to bound it.
- **Nothing here measures dashboard query performance**, ClickHouse read latency,
  or the heavy-query set in `03-clickhouse-queries.md`.
- **Never mix these figures with the image numbers** in
  `verification/benchmarks/04-images-and-boot.md`: those are compressed registry
  sizes and container-level RSS, these are per-process host RSS.
