# Session E2E

Two harnesses over a shared foundation (`lib.ts`), both driving the **real stack**
over HTTP and asserting state in **both ClickHouse and Redis**:

- `session-e2e.ts` (`e2e:sessions`) — **correctness**: the full lifecycle for one
  session per scenario (open/extend/close via reaper + boundary, replay, identify),
  including Redis cleanup.
- `session-stress.ts` (`e2e:sessions:stress`) — **volume + drain**: ramps out many
  sessions, then drives reaper + buffer flushes until *everything* has drained
  (every `session_end` emitted, Redis cleaned, session buffer empty) and reconciles
  the ClickHouse counts. Exits only when nothing is left open.

## What it covers

| Scenario | Asserts |
|----------|---------|
| Single session → reaper close | session blob + wallclock + projects-set in Redis; one `session_start` + N events in CH; after the reaper closes it: one `session_end`, a collapsed `sessions` row, and Redis fully cleaned (blob + wallclock gone, idempotency claim present). |
| Boundary split | a >idle-window gap opens a NEW session id and emits a `session_end` for the first + a `session_start` for the second. |
| Replay | a replay chunk lands in `session_replay_chunks` under the echoed session id. |
| Identify | `session:profile:{pid}:{profileId}` pointer written; events carry the identified `profile_id`. |

## Running

Sessions idle out after 30 min by default. Shrink that and start the stack with
the **same** value the harness uses, then run the harness:

```bash
# 1. Start the stack with a short idle window (Docker must be up: pnpm dock:up)
SESSION_TIMEOUT_MS=4000 pnpm dev

# 2. In another terminal, run the harness with the SAME timeout
SESSION_TIMEOUT_MS=4000 pnpm --filter @openpanel/api e2e:sessions

# …or the stress + drain test (500 sessions by default)
SESSION_TIMEOUT_MS=4000 pnpm --filter @openpanel/api e2e:sessions:stress
```

Stress tunables (env): `E2E_SESSIONS` (500), `E2E_CONCURRENCY` (25),
`E2E_EVENTS_PER_SESSION` (3), `E2E_DRAIN_TIMEOUT_MS` (120000).

It exits non-zero if any check fails and prints a summary. Total run is ~30–60s
with a 4s window (each close waits roughly one idle window).

The harness triggers the reaper on demand via the worker's `/debug/cron`
endpoint, so it never waits for the 5-minute reaper cron.

### Notes
- Uses a dedicated, isolated project (`e2e-sessions`) and a throwaway client
  (`ignoreCorsAndSecret`), created/upserted automatically under org `openpanel-dev`.
- Each run uses fresh device IPs, so reruns don't collide with prior state.
- Overridable: `E2E_API_URL` (default `:3333`), `E2E_WORKER_URL` (default `:9999`).
- The harness and the stack **must share the same `SESSION_TIMEOUT_MS`** — the
  harness derives its idle waits from it.

## P1 baseline — measured throughput (2026-09-02)

`BASE-002` never produced a V1 stress number (both databases were unusable on
this box at the time — `verification/benchmarks/02-api-throughput.md`), so this
run **is** the baseline later phases compare against. Recorded here because the
number has to outlive the task that measured it.

| | |
|---|---|
| transport | Kafka/Redpanda only (`KAFKA_BROKERS=localhost:19092`); GroupMQ deleted in P1-001 |
| rev | `dc7516df` + this commit, `rewrite/v2` |
| machine | 4 vCPU AMD EPYC-Milan, 15 GiB RAM, Linux 6.8.0-137, Node v24.20.0 — api, worker, Redpanda, ClickHouse, Postgres and Redis all on the same 4 cores |
| harness | `e2e:sessions:stress`, `SESSION_TIMEOUT_MS=4000` |

**Baseline (documented defaults — 500 sessions × 3 events, concurrency 25):**
`emit` 2.0s median over 10 consecutive green runs (1.9–2.1s) =
**≈750 events/s**, one `POST /track` per event. Full run (emit → settle →
reaper drain → reconcile) 15–21s wall, 13/13 checks, 10/10 runs green.

**Concurrency sweep (2000 sessions × 3 events):** 25 → 759/s, 50 → 779/s,
100 → 789/s. Flat: the ceiling is the single API process on a shared 4-core
box, not client concurrency — consistent with DISC-021's per-process
`producer.send()` serialisation (`idempotent: true`, `maxInFlightRequests: 1`).
The ADR-004 producer redesign is the named lever, and is a separate decision.

Not measured here: per-request P50/P95/P99. `track()` in `lib.ts` has no timing
instrumentation and adding a load generator is out of this task's scope.

### One V1 property this harness has to work around

`/track` answers with a session id it derives from the Redis session blob — but
that blob is written by the **worker**, asynchronously. Until it exists the API
falls back to an id that is deterministic per `SESSION_TIMEOUT_MS`-wide time
bucket (`apps/api/src/utils/ids.ts`). At the 30-minute production default a
bucket boundary is effectively never hit mid-visit; at the harness's compressed
4s window it is hit inside the emit ramp, and every session in flight at that
instant is told a *different* id for its next event.

The rows still land — they just carry a session id the harness was never given.
That is why `reconcile` counts by **device within the run window** and not by
the echoed session ids: scoped by session id the same run reads 2490/2500 and
looks like event loss when nothing was lost. Verified against the same data:
device-scoped 2500, session-scoped 2490, `session_start`/`session_end` 500 in
both. Pre-existing V1 behaviour, unrelated to the transport.
