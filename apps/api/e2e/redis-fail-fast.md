# M18-003 — the cache client's fail-fast, measured

What `/track` costs when the Redis **cache** is unreachable, before and after
the change in `packages/redis/redis.ts`. Every number below is a paste from a
run on this box; nothing here is estimated.

**Box** — 4 cores, 15 GB, Linux 6.8.0-137; Redis 7.2.5 on `127.0.0.1:6379`;
Postgres, ClickHouse and Redpanda local. **Date** 2026-09-13. **Base revision**
`714dae9d`. "Before" is that revision's `packages/redis/redis.ts` verbatim;
"after" is the same tree with this task's change applied and nothing else.

## Reproducing

```bash
cd apps/api
# the fault harness — spawns its own API on :3399 behind a TCP proxy for Redis
LOG_LEVEL=warn dotenv -e ../../.env -- bun e2e/redis-fail-fast.ts
# phases A-C only (the recovery-window comparison)
LOG_LEVEL=warn M18_QUICK=1 M18_OUTAGE_MS=60000 dotenv -e ../../.env -- bun e2e/redis-fail-fast.ts
# what a legitimate command costs, which is what bounds commandTimeout
dotenv -e ../../.env -- bun e2e/redis-command-cost.ts
```

The comparison runs ("before", `commandTimeout` only, ioredis's default backoff)
are the same harness against an edited `createFailFastCacheClient` — the option
under test removed, nothing else — and the tree was restored to the committed
version afterwards, verified by hash.

The harness never touches the shared server's data: the API under test is
pointed at a local TCP proxy it can stop (`refuse`, a `docker stop`) or freeze
(`blackhole`, a `docker pause`), on Redis database 3 and its own Kafka topic.
The operator's dev stack keeps its own connection to `:6379` throughout.

## The headline

| Fault | Shape | Before | After |
|---|---|---|---|
| Redis stopped | warm-auth `/track` | **2 of 3 no answer in 30 s**, the third 500 at 30,001 ms | **200 × 10, p50 10.0 ms** |
| Redis stopped | cold-auth `/track` | 2 of 3 no answer in 30 s, one 500 at 30,001 ms | **500 × 10, p50 1.3 ms** |
| Redis stopped | browser-origin `/track` | 500 at **12,041 ms**, one no answer in 30 s | 500 × 10, p50 1.0 ms |
| Redis stopped | `/healthcheck` | no answer in 30 s | **503 in 17 ms** |
| Redis frozen | warm-auth `/track` | 5 of 5 no answer in 30 s | **200 × 5 at 1,010 ms** |
| Redis frozen | browser-origin `/track` | 5 of 5 no answer in 30 s | 500 × 5 at 502 ms |
| booted with Redis down | first `/track` | no answer in 30 s | 500 in 516 ms |

The before column reproduces drill 02 (`verification/drills/02-redis-unavailable.md`):
12,041 ms here against its 12,039 ms, and the same "half the requests never
answered" shape. The 41,978 ms outlier drill 02 saw is above this harness's
30 s client timeout, so it shows up as `no-answer(AbortError)` instead.

The behavioural acceptance criterion is the first two rows: **warm auth keeps
its normal latency and still answers 200** (10.0 ms p50 against a 11.7 ms p50
healthy baseline — the auth resolves from the process-local LRU and the session
lookup degrades to the deterministic id), and **cold auth fails promptly**
(1.3 ms) instead of hanging.

## Raw output

### Before — `714dae9d` unmodified (`M18_OUTAGE_PROBES=3`)

```
── A. healthy baseline ──
warm-secret /track                 n=20 200×20                 p50=10.8ms p95=12.1ms max=12.1ms
browser-origin /track              n=20 200×20                 p50=11.0ms p95=14.5ms max=14.5ms

── B. sustained outage (20s, refuse) ──
warm-secret /track                 n=3 no-answer(AbortError)×2 500×1 p50=30001.2ms p95=30001.6ms max=30001.6ms
cold-unknown /track                n=3 no-answer(AbortError)×2 500×1 p50=30001.2ms p95=30001.7ms max=30001.7ms
browser-origin /track              n=3 500×2 no-answer(AbortError)×1 p50=12041.4ms p95=30001.5ms max=30001.5ms
/healthz/live                      status=200 1.2ms
/healthz/ready                     status=200 4.5ms
/healthcheck                       status=no-answer(AbortError) 30001.3ms

── C. recovery ──
first browser-origin 200 after restore: 64ms (status 200)
browser-origin /track              n=20 200×20                 p50=10.7ms p95=18.8ms max=18.8ms

── D. 1000ms blip under load ──
warm-secret, control               n=2745 200×2745               p50=10.8ms p95=12.8ms max=18.1ms
                                   failures=0 over 0ms of wall clock, distinct sessionIds=3
warm-secret, blip                  n=2313 200×2313               p50=10.7ms p95=12.2ms max=1074.2ms
                                   failures=0 over 0ms of wall clock, distinct sessionIds=3
browser-origin, control            n=2490 200×2490               p50=12.0ms p95=13.9ms max=23.2ms
                                   failures=0 over 0ms of wall clock, distinct sessionIds=2
browser-origin, blip               n=2030 200×2030               p50=12.2ms p95=13.9ms max=1069.8ms
                                   failures=0 over 0ms of wall clock, distinct sessionIds=2

── E. blackhole (frozen dependency) ──
warm-secret /track                 n=5 no-answer(AbortError)×5 p50=30000.9ms p95=30001.0ms max=30001.0ms
browser-origin /track              n=5 no-answer(AbortError)×5 p50=30000.8ms p95=30001.0ms max=30001.0ms

── F. boot with Redis down ──
booted with redis unreachable: true (2235ms)
  /healthz/live                    status=200 4.7ms
  /healthz/ready                   status=200 2.0ms
  /healthcheck                     status=503 10552.1ms
  cold /track (never had redis)      n=1 no-answer(AbortError)×1 p50=30001.0ms p95=30001.0ms max=30001.0ms
  /track once redis returns: status=200 15.2ms
  /healthz/ready                   status=200 1.1ms
  /healthcheck                     status=200 12.5ms
```

### After — with the change

```
── A. healthy baseline ──
warm-secret /track                 n=20 200×20                 p50=11.7ms p95=13.0ms max=13.0ms
browser-origin /track              n=20 200×20                 p50=11.8ms p95=14.6ms max=14.6ms

── B. sustained outage (20s, refuse) ──
warm-secret /track                 n=10 200×10                 p50=10.0ms p95=11.8ms max=11.8ms
cold-unknown /track                n=10 500×10                 p50=1.3ms p95=3.0ms max=3.0ms
browser-origin /track              n=10 500×10                 p50=1.0ms p95=1.4ms max=1.4ms
/healthz/live                      status=200 0.9ms
/healthz/ready                     status=200 2.4ms
/healthcheck                       status=503 17.1ms

── C. recovery ──
first browser-origin 200 after restore: 336ms (status 200)
browser-origin /track              n=20 200×20                 p50=11.0ms p95=12.1ms max=12.1ms

── D. 1000ms blip under load ──
warm-secret, control               n=2620 200×2620               p50=11.3ms p95=13.5ms max=19.0ms
                                   failures=0 over 0ms of wall clock, distinct sessionIds=2
warm-secret, blip                  n=2830 200×2830               p50=10.8ms p95=12.7ms max=18.4ms
                                   failures=0 over 0ms of wall clock, distinct sessionIds=2
browser-origin, control            n=2320 200×2320               p50=12.5ms p95=18.2ms max=26.5ms
                                   failures=0 over 0ms of wall clock, distinct sessionIds=3
browser-origin, blip               n=6840 200×1980 500×4860      p50=1.2ms p95=13.0ms max=17.8ms
                                   failures=4860 over 1220ms of wall clock, distinct sessionIds=3

── E. blackhole (frozen dependency) ──
warm-secret /track                 n=5 200×5                  p50=1009.7ms p95=1010.1ms max=1010.1ms
browser-origin /track              n=5 500×5                  p50=501.8ms p95=501.9ms max=501.9ms

── F. boot with Redis down ──
booted with redis unreachable: true (2224ms)
  /healthz/live                    status=200 2.5ms
  /healthz/ready                   status=200 3.7ms
  /healthcheck                     status=503 503.5ms
  cold /track (never had redis)      n=1 500×1                  p50=515.8ms p95=515.8ms max=515.8ms
  /track once redis returns: status=200 74.5ms
  /healthz/ready                   status=200 0.7ms
  /healthcheck                     status=200 6.7ms
```

## The mechanism, and what it costs

Two settings, because there are two faults, and `commandTimeout` alone does not
fix the one that matters.

**1. The offline queue goes off once the client has connected** — a command
issued while the socket is known-down is rejected in microseconds instead of
queued behind a 20-attempt reconnect cycle. This is what produces the 10.0 ms
warm `/track` and the 1.3 ms cold refusal in phase B. `commandTimeout` on its
own would have made those 500 ms each, not 1 ms.

**2. `commandTimeout: 500`** — the offline queue cannot see the fault where the
socket is UP and the server answers nothing. Phase E is that fault: 30 s of
nothing before, 1,010 ms after for the warm shape (two cache calls in series,
each cut off at the 500 ms deadline) and 502 ms for the browser shape.

**The cost is the blip** (phase D — a 1 s outage under 5 concurrent clients,
each shape run twice, once without the fault as a control):

| Shape | Before | After |
|---|---|---|
| warm-auth | 0 failures, one request stretched to 1,074 ms | 0 failures, max 18.4 ms |
| browser-origin | 0 failures, one request stretched to 1,070 ms | **4,860 × 500 over 1,220 ms** |

That is the whole trade, stated plainly: a 1 s Redis blip used to cost the
browser-shaped `/track` a ~1 s stall and no errors; it now costs it ~1.2 s of
500s. The warm-auth shape pays nothing either way — it degrades to the
deterministic session id. `distinct sessionIds` is unchanged between control
and blip in every run, so no session was split by the faster failure.

### The third configuration, measured too

`commandTimeout` alone — the offline queue left ON — is a real middle ground and
was measured as its own run, same harness, same box:

| | before (neither) | `commandTimeout` only | fail-fast + `commandTimeout` (chosen) |
|---|---|---|---|
| outage, warm-auth `/track` | 2 of 3 unanswered in 30 s | 200 at **1,011 ms** | 200 at **10.0 ms** |
| outage, cold-auth `/track` | 2 of 3 unanswered in 30 s | 500 at 502 ms | 500 at 1.3 ms |
| outage, `/healthcheck` | unanswered in 30 s | 503 in 504 ms | 503 in 17 ms |
| 1 s blip, browser-origin | 0 failures, one 1,070 ms stall | **5 failures over 504 ms** | 4,860 failures over 1,220 ms |
| frozen server, warm-auth | unanswered in 30 s | 200 at 1,010 ms | 200 at 1,010 ms |

`commandTimeout` alone is much the gentler option on the blip — ioredis arms the
deadline in `sendCommand`, before the writable check, so a queued command is
under it too, and only the five requests that waited past 500 ms failed. But it
does not meet this task's behavioural criterion: a warm-auth `/track` during the
outage takes 1,011 ms, not "tens of ms", because every request still pays the
full deadline twice over for a dependency whose answer it is going to discard.
Fail-fast is what turns that back into 10.0 ms. The chosen configuration is the
combination, and the blip is what it costs.

Its phases B and D, verbatim:

```
── B. sustained outage (20s, refuse) ──
warm-secret /track                 n=10 200×10                 p50=1011.3ms p95=1011.9ms max=1011.9ms
cold-unknown /track                n=10 500×10                 p50=502.1ms p95=504.3ms max=504.3ms
browser-origin /track              n=10 500×10                 p50=502.2ms p95=502.5ms max=502.5ms
/healthz/live                      status=200 0.9ms
/healthz/ready                     status=200 3.8ms
/healthcheck                       status=503 503.9ms

── D. 1000ms blip under load ──
warm-secret, control               n=2520 200×2520               p50=11.8ms p95=13.8ms max=21.9ms
                                   failures=0 over 0ms of wall clock, distinct sessionIds=3
warm-secret, blip                  n=2118 200×2118               p50=11.6ms p95=13.8ms max=1010.9ms
                                   failures=0 over 0ms of wall clock, distinct sessionIds=2
browser-origin, control            n=2355 200×2355               p50=12.8ms p95=14.9ms max=20.7ms
                                   failures=0 over 0ms of wall clock, distinct sessionIds=2
browser-origin, blip               n=1950 200×1945 500×5         p50=12.8ms p95=14.7ms max=514.5ms
                                   failures=5 over 504ms of wall clock, distinct sessionIds=3
```

### Why the reconnect backoff is capped at 500 ms

With the offline queue off, the reconnect backoff becomes user-visible: while
ioredis waits out its next attempt, every command is rejected, so the failures
outlive the outage. ioredis's default is `min(attempt * 50, 2000)` ms, and the
attempt counter keeps climbing for as long as the server is away (measured
directly: attempt 28, next delay 1,400 ms, 19 s into an outage). Time from
"Redis is back" to "`/track` answers 200 again", phase C, three runs each at
20 s and two each at 60 s:

| Outage | ioredis default cap (2,000 ms) | this change (500 ms) |
|---|---|---|
| 20 s | 390 / 395 / 396 ms | 349 / 340 / 342 ms |
| 60 s | 1,137 / 1,135 ms | 416 / 413 ms |

The cap costs nothing (a reconnect to a live local server is sub-millisecond)
and bounds that window at roughly half a second however long the outage was.

### Why 500 ms and not 100 ms

`commandTimeout` applies to every command the cache client issues, including
the event buffer's. If it is anywhere near a busy flush, a healthy server
starts failing as if it were down — and under M18-001 a failed flush refuses to
commit Kafka offsets. `bun e2e/redis-command-cost.ts`, same box, same day:

```
redis 127.0.0.1:6379 db 4, mean row 998B, batch 4000
MULTI 4000x rpush (shutdown flush)     n=20 payload=3992000B p50=21.04ms p95=33.95ms p99=33.95ms max=33.95ms
MULTI 100x rpush (steady state)        n=200 payload=99800B p50=0.70ms p95=0.81ms p99=1.77ms max=1.86ms
LRANGE 0..3999 (cron flush)            n=100 payload=3992000B p50=5.68ms p95=12.86ms p99=21.26ms max=21.26ms
GET (auth / cache lookup)              n=2000 p50=0.11ms p95=0.14ms p99=0.18ms max=4.45ms
```

500 ms is ~15x the heaviest legitimate command (a 4 MB `MULTI` of 4,000 rpush,
34 ms) and ~2,800x a `GET`. 100 ms would be only 3x the flush, which is too
close for a box under load.

## Boot ordering — the one real risk

With the offline queue off from construction, ioredis rejects every command
issued before the first connect completes, so boot order would decide whether a
command works. The queue therefore **stays on until the client's first `ready`**;
a process that has never reached Redis falls back to `commandTimeout`, which is
bounded. Phase F is the proof: an API booted with Redis already unreachable
comes up in 2,224 ms (2,235 ms before, so booting is not slower), `/healthz/live`
and `/healthz/ready` answer 200 in single-digit ms, `/healthcheck` reports
**503 in 504 ms** instead of hanging for 10.5 s, the first `/track` fails in
516 ms instead of never answering, and once Redis returns the same process
serves 200s again (74.5 ms) with `/healthcheck` back to 200. `packages/redis/redis.test.ts`
pins the same property as a unit test: a command issued in the same tick as the
client's construction resolves rather than throwing "Stream isn't writeable".

## Interaction with M18-001

M18-001's shutdown flushes the event buffer's micro-batch to Redis and refuses
to commit offsets if that flush fails. Fail-fast makes that flush fail *faster*,
which is correct only if a fast rejection still reads as a failure. ioredis
**resolves** a `MULTI` whose individual commands failed, so the property that
matters is that a fail-fast client *rejects* the `exec()` — pinned by
`packages/redis/redis.test.ts` ("MULTI under fail-fast", rejects in under
100 ms once the server is gone). The rest of the chain is already covered:
`event-buffer.test.ts:370` (the buffer rethrows and keeps the events) and
`shutdown.test.ts:113` (a rejected `flushEventBuffer` returns
`SHUTDOWN_EXIT_FAILED`, so nothing is committed).

## Not covered here

The duplicate from drill 02's finding (1) — an event landing in ClickHouse more
than once after a handler failure plus a rebalance — is out of scope for
M18-003 and untouched by this change.
