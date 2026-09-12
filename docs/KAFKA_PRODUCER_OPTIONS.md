# The Kafka producer's throughput knobs — what to measure, and how

M16-002. This document exists so the operator's four-configuration measurement
run, and the ADR Carl writes from it (ADR-004's producer-redesign question),
are built on precise statements about which knob produces which behaviour.

**Nothing here is switched on.** Every default reproduces the behaviour
measured in `verification/benchmarks/05-v2-saturation.md`: one produce
round-trip at a time, one message per `send()`, awaited in the request path.

## The bottleneck being measured

`05-v2-saturation.md` (operator run, 2026-09-12, 4-core box): V2 `/track`
plateaus at **~780–806 events/s** with ~85 % of the CPU unused, while P50
latency doubles with every doubling of concurrency (29 → 456 ms from
concurrency 25 → 400). The cause is in
`packages/core/src/modules/ingest/src/kafka.ts`: one shared producer with
`maxInFlightRequests: 1`, and one awaited `send()` carrying a **single**
message per request. ~800/s is ~1.25 ms per local ack, serialised.

Four options were named. This task makes **2** and **4** measurable:

| # | Option | Status |
|---|---|---|
| 1 | More api processes | Already the cloud deployment's scaling story (Carl). A live fallback, not a candidate — nothing below has to reach 5,000 ev/s in one process. |
| 2 | **Batch: one `send()`, many messages** | Built, default **off** — `KAFKA_PRODUCER_BATCH_SIZE` / `KAFKA_PRODUCER_BATCH_LINGER_MS`. |
| 3 | Don't await the broker; buffer and flush async | **Deliberately not built.** It changes what a 200 response promises — a durability decision for Carl, not a performance tweak. |
| 4 | **Raise `maxInFlightRequests`** | Built, default **1** (unchanged) — `KAFKA_PRODUCER_MAX_IN_FLIGHT`. |

## The knobs

All three are read by the config loader, `apps/api/src/config/env.ts` (the sole
`process.env` reader, ADR-022 R7), and resolved in
`packages/core/src/modules/ingest/src/producer-tuning.ts`.

| Env var | Default | What it does |
|---|---|---|
| `KAFKA_PRODUCER_MAX_IN_FLIGHT` | `1` | kafkajs `maxInFlightRequests`: how many produce requests may be outstanding on the producer's connection at once. `1` is today's value and serialises every produce. Raising it lets requests overlap — read the retry coupling below before you do. |
| `KAFKA_PRODUCER_BATCH_SIZE` | `1` | Messages accumulated into ONE `send()`. `1` means batching is off and the code path is byte-for-byte today's: one message, one awaited send. `>= 2` turns the accumulator on. |
| `KAFKA_PRODUCER_BATCH_LINGER_MS` | `5` | How long a partially filled batch may wait for company before it is sent anyway. **Inert while the batch size is 1.** |

Positive integers only; a blank or malformed value fails boot, like every other
`KAFKA_*` knob. The resolved values are logged once, on the
`kafka producer connected` line, so a measurement run can be tied to the
configuration that produced it:

```json
{"topic":"events","maxInFlight":5,"batchSize":25,"batchLingerMs":10,"batching":true,"msg":"kafka producer connected"}
```

### What batching does and does not change

Batching only touches the **events topic** (`produceIncomingEvent`). The
dead-letter path produces one poison record at a time and has no round-trip to
amortise, so it keeps the direct path.

The accumulator (`src/producer-batcher.ts`) holds two guarantees, each with a
test in `src/producer-batcher.test.ts`:

1. **Per-key ordering survives.** Messages leave in the order they were
   enqueued — within a batch because the array preserves that order (kafkajs
   partitions per message by key, and same-key messages in one `send()` land in
   one partition batch in array order), and across batches because the
   accumulator keeps exactly **one send outstanding at a time**. That second
   half is why ordering does not depend on `maxInFlightRequests` staying at 1.
2. **A caller's promise settles on its own batch.** A failed `send()` rejects
   exactly the callers whose messages were in it, and nobody else; the next
   batch is still sent. A batch that fails fatally
   (`OUT_OF_ORDER_SEQUENCE_NUMBER` and friends) runs the same
   `resetProducer` recovery a lone message did — the batched and unbatched
   paths are the same `sendMessages` call.

A partially filled batch is flushed inside the linger window, so a low-traffic
instance never strands an event; `disconnectKafka` flushes what is still
accumulating before the producer closes, so a shutdown inside the linger window
cannot strand one either.

What batching does **not** change: idempotency stays on, `maxInFlightRequests`
is untouched by it, the topic, key and envelope are identical, and `/track`
still answers only after the broker has acknowledged the caller's message.

### The retry coupling — why option 4 must not be measured alone

kafkajs 2.2.4 defaults an idempotent producer to
`retries: Number.MAX_SAFE_INTEGER`, and logs
`Limiting retries for the idempotent producer may invalidate EoS guarantees`
when you lower it (`kafkajs/src/producer/index.js:43-55`). This codebase
lowers it: `KAFKA_PRODUCER_RETRIES`, `DEFAULT_KAFKA_PRODUCER_RETRIES = 2`.

So today's `maxInFlightRequests: 1` is plausibly **compensating for a retry
setting that already weakened idempotency**, and the in-code comment
("1 (not 5) to avoid in-flight reordering … reordered batches trip
`OUT_OF_ORDER_SEQUENCE_NUMBER` and stick the producer per-partition") is
consistent with that reading.

**Consequence for the measurement: vary `KAFKA_PRODUCER_RETRIES` together with
`KAFKA_PRODUCER_MAX_IN_FLIGHT`.** A configuration-4 run at `retries=2` is a
different durability posture from one at kafkajs's own default, and a
throughput number from either is not transferable to the other. M16-002 did
**not** change the retry default; that is part of the decision, not part of
making it measurable.

Note that option 2 sidesteps this entirely: batching amortises the round-trip
while leaving `maxInFlightRequests`, idempotency and ordering exactly as they
are. That is why it is the likelier candidate for adoption.

## Reproducing the four configurations

The harness is `apps/api/e2e/saturation-sweep.ts` (M16-001); its knobs are
documented in `docs/BENCHMARK_HARNESS.md`. The producer knobs belong to the
**api process**, not to the harness, so they are set when the stack is booted
and the stack is restarted between configurations.

```bash
# 1. BASELINE — today's behaviour. No producer env at all.
cd apps/api && API_PORT=3333 bun run dev

# 2. HIGHER IN-FLIGHT (option 4)
cd apps/api && API_PORT=3333 KAFKA_PRODUCER_MAX_IN_FLIGHT=5 bun run dev

# 3. BATCHING (option 2)
cd apps/api && API_PORT=3333 \
  KAFKA_PRODUCER_BATCH_SIZE=25 KAFKA_PRODUCER_BATCH_LINGER_MS=10 \
  bun run dev

# 4. BOTH
cd apps/api && API_PORT=3333 \
  KAFKA_PRODUCER_MAX_IN_FLIGHT=5 \
  KAFKA_PRODUCER_BATCH_SIZE=25 KAFKA_PRODUCER_BATCH_LINGER_MS=10 \
  bun run dev
```

and against each stack, the same sweep `05-v2-saturation.md` ran:

```bash
cd apps/api
E2E_WORKER_URL=http://localhost:3333 \
  SWEEP_LADDER=25,50,100,200,400,800 \
  E2E_SESSIONS=2000 E2E_EVENTS_PER_SESSION=3 \
  bun run e2e:saturation
```

Confirm each run's configuration from the api's own
`kafka producer connected` log line before recording its numbers — the knobs
are read at boot, and a stale stack silently measures the previous
configuration.

Two things worth holding constant, from `05-v2-saturation.md`: split the roles
(`ROLE=api` and `ROLE=worker` as two processes) or the api and worker
CPU/RSS rows are the same pid, and keep the auth path fixed —
`SWEEP_AUTH_MODE=secret` is the harness default and the pessimistic, real
server-side-SDK path.

Batch size and linger deserve a small ladder of their own inside
configuration 3 (e.g. size 10/25/100 at linger 5/10/25): the batch size is
bounded in practice by how many requests are actually in flight at the offered
concurrency, and a batch size far above that only ever fills by linger timeout.

## Proof runs performed by this task (not the measurement)

Run by the agent on 2026-09-12 on the same 4-core box, against a
purpose-booted `ROLE=api` api on `API_PORT=3399` producing into the running
dev stack's consumer. These prove the flags take effect and that nothing
regresses. **They are far too small to support a throughput conclusion** —
150 sessions × 3 events = 450 requests per run, and the two baseline runs
differ from each other by 50 %.

| configuration | `session-stress` emit window | P50 | P95 | checks |
|---|---|---|---|---|
| default (`maxInFlight=1`, batching off), run 1 | 0.9 s | 91.7 ms | 142.9 ms | 13/13 |
| default, run 2 | 0.6 s | 67.0 ms | 79.9 ms | 13/13 |
| `MAX_IN_FLIGHT=5 BATCH_SIZE=25 LINGER_MS=10`, run 1 | 0.5 s | 48.4 ms | 77.3 ms | 13/13 |
| same, run 2 | 0.5 s | 45.7 ms | 95.2 ms | 13/13 |

Every run reconciled its ClickHouse event counts exactly
(`session_start == sessions`, `session_end == sessions`, total events ==
`sessions × (events + start + end)`), with Kafka peak lag 1 and no queue or
buffer left off zero. The session e2e passed 29/29 against both
configurations — and because that suite sends single events with nothing else
in flight, its passing under `BATCH_SIZE=25` is also the end-to-end proof that
the linger flush works: every one of those events left as a partial batch.

## What is still unknown

- **Whether either option moves the plateau at all.** Nothing here has been
  measured at saturation. The ~800 ev/s ceiling is attributed to the
  serialised produce path by elimination (idle CPU, clean event loop, consumer
  lag ≈ 0), not by an experiment that removed the serialisation.
- **Whether the produce path is the only serialising dependency.**
  `05-v2-saturation.md` names two other candidates it did not exonerate: the
  Redis session-state operations and the event buffer. If the plateau holds
  with batching on, the next suspect is one of those, not a bigger batch.
- **The right batch size and linger for production**, and whether a linger of
  a few ms is acceptable in the request path at all — it is latency added to
  every `/track` that is not in a full batch.
- **The durability posture.** Both the retry coupling above and option 3 are
  Carl's to decide; this task deliberately leaves both alone.
- **Ordering under `maxInFlightRequests > 1` without batching** is exactly the
  risk the existing in-code comment describes, and it is unmeasured: a
  configuration-2 run that never hits a broker hiccup proves nothing about
  what happens when one occurs.

## One structural note for whoever lands the follow-up

The three fields ride on `config.kafka`, but they are declared as the optional
members of `KafkaProducerTuning` in
`packages/core/src/modules/ingest/ingest.constants.ts` rather than on
`KafkaConfig` in `packages/core/src/config.ts` — that file is outside
M16-002's declared scope. The loader always sets all three; the fallbacks in
`src/producer-tuning.ts` only apply to a `CoreConfig` built by a test fixture,
and they reproduce today's behaviour. The follow-up is one edit: move the
three fields onto `KafkaConfig` as required numbers, add them to
`packages/core/test/config-fixture.ts`, delete `KafkaProducerTuning` and the
fallbacks, and drop the intersection from `deriveKafkaConfig`'s return type.

The three env vars are also missing from `.env.example`, for the same reason —
it is not in this task's scope.
