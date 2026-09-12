# Scaling OpenPanel: what one box actually takes

This page answers two questions a self-hoster has before they install anything:
**how much traffic will one box swallow**, and **what happens when I outgrow
it**. It is written in events/second *and* events/month, because nobody plans
capacity in events/second but every benchmark is measured in them.

Every throughput figure below is a measured number from an operator run on one
specific machine, on 2026-09-12. None of them is extrapolated. Read
["What this page is not"](#what-this-page-is-not) before you quote any of them
at a different machine.

---

## The short answer

| | events/second | events/month, flat out |
|---|---|---|
| **What ships today** (no producer batching) | **744** | **1.96 bn** |
| With batching enabled (batch 25 / linger 25 ms) | 1,904 | 5.01 bn |
| Two api processes, batch 25 / linger 5 ms | 1,936 aggregate | 5.09 bn |

"Flat out" means every second of the month at that rate. **That is not your
capacity.** Real traffic has a daily peak several times its average, and the box
has to survive the peak. Skip to
[Peak vs average](#peak-vs-average-the-only-number-worth-planning-with) —
that section is why this page exists.

Batching is **off by default** and turning it on is pending an accepted ADR, so
the 744 ev/s row is what an unmodified install does today.

---

## The box these numbers came from

A single node, 4 cores, 15 GB RAM. Postgres, Redis, ClickHouse and Redpanda all
run on it in local docker compose, **alongside** the api process, the worker
process and the load generator itself.

That co-location is not incidental. The load generator competes for the same
four cores as the thing it is measuring, so these are numbers for *a whole
OpenPanel stack on one small box*, not for an api process with a backend to
itself. A bigger box, a managed ClickHouse, or an external broker all move them.

All ingest figures are `/track` with a **real client secret** — the
server-side-SDK auth path, which is the most expensive of the three and
therefore the pessimistic one. One api process unless the row says otherwise.

---

## Measured sustained ingest

Sustained means the rate at which the Kafka consumer still drains back to zero
after the load stops — not a burst rate.

| Configuration | events/second | events/month, flat out |
|---|---|---|
| No batching — **today's default** | **744** | 1,956,571,200 (**1.96 bn**) |
| `maxInFlightRequests: 5`, no batching | 769 | 2,022,316,200 (2.02 bn) |
| Batch 25 / linger 5 ms | 1,515 | 3,984,147,000 (3.98 bn) |
| Batch 25 / linger 10 ms | 1,716 | 4,512,736,800 (4.51 bn) |
| Batch 25 / linger 25 ms | 1,904 | 5,007,139,200 (5.01 bn) |
| **Two api processes**, batch 25 / linger 5 ms | 1,936 aggregate (980 + 955) | 5,091,292,800 (5.09 bn) |

Two results worth stating plainly, because they close off tuning directions
that look promising:

- **Batch size is flat from 25 upward.** At linger 10 ms: 25 → 1,716,
  50 → 1,726, 100 → 1,618, 250 → 1,639 ev/s. The spread is within run-to-run
  noise on this box. Picking a bigger batch buys nothing; the linger is the
  knob that moves the number.
- **Raising `maxInFlightRequests` to 5 is noise.** 769 ev/s against a 744 ev/s
  baseline is +3%, which this box cannot distinguish from run-to-run variation.
  It is not a lever.

The knob reference — what each setting does, and the kafkajs retry coupling you
must understand before raising `maxInFlightRequests` — lives in
[`KAFKA_PRODUCER_OPTIONS.md`](./KAFKA_PRODUCER_OPTIONS.md). How to reproduce any
run above is [`BENCHMARK_HARNESS.md`](./BENCHMARK_HARNESS.md).

---

## From events/second to events/month

One month is 30.44 days on average:

```
30.44 days x 24 h x 60 min x 60 s = 2,629,800 seconds

events/month = events/second x 2,629,800
```

Worked, flat out — 100% duty cycle, every second of the month at the peak rate:

| events/second | x 2,629,800 | = events/month |
|---|---|---|
| 744 (today's default) | 744 x 2,629,800 | 1,956,571,200 — **1.96 bn** |
| 1,515 | 1,515 x 2,629,800 | 3,984,147,000 — **3.98 bn** |
| 1,904 | 1,904 x 2,629,800 | 5,007,139,200 — **5.01 bn** |
| 1,936 | 1,936 x 2,629,800 | 5,091,292,800 — **5.09 bn** |
| 5,000 (the project's stated target) | 5,000 x 2,629,800 | 13,149,000,000 — **13.15 bn** |

---

## Peak vs average: the only number worth planning with

**Do not use the flat-out column as your monthly budget.** It assumes your
traffic arrives as a perfectly flat stream, and analytics traffic never does. A
site's busiest second is several times its average second — office hours, a
launch, a newsletter send, a timezone everyone is awake in. The box has to
survive the *peak*; the *average* is what fills your monthly total.

So the honest planning formula is:

```
monthly events = peak_capacity_ev_s x 2,629,800 / peak_to_average_ratio
```

where `peak_capacity_ev_s` is a measured row from the table above and
`peak_to_average_ratio` is **your** busiest second divided by your average
second.

Worked at a ratio of 3:1:

| peak capacity | average sustained | monthly events at 3:1 |
|---|---|---|
| 744 ev/s (today's default) | 248 ev/s | **~0.65 bn/month** |
| 1,515 ev/s (batch 25 / linger 5 ms) | 505 ev/s | **~1.33 bn/month** |
| 1,904 ev/s (batch 25 / linger 25 ms) | ~635 ev/s | **~1.67 bn/month** |
| 1,936 ev/s (two api processes) | ~645 ev/s | **~1.70 bn/month** |

> **3:1 is an illustration, not a measurement.** Nothing in any benchmark here
> measured a peak-to-average ratio; it is a placeholder so the arithmetic is
> visible. The right ratio depends entirely on your own traffic shape and how
> spread your visitors are across timezones — a single-country B2B product can
> be far peakier than 3:1, a worldwide consumer app much flatter. Substitute
> your own: take a week of your existing analytics, divide the busiest minute's
> rate by the week's average rate, and use that.

A reader who takes the flat-out number as their monthly budget will be
**underprovisioned at their daily peak**: the month's total fits, and the box
still falls behind every afternoon.

---

## Turning batching on

Batching amortises one Kafka produce round-trip across many events, which is
where the 744 → ~1,900 ev/s difference comes from. It is configured with
`KAFKA_PRODUCER_BATCH_SIZE` and `KAFKA_PRODUCER_BATCH_LINGER_MS`, both
documented in [`KAFKA_PRODUCER_OPTIONS.md`](./KAFKA_PRODUCER_OPTIONS.md).

**It is off by default and it stays off until an ADR accepts it.** The measured
rows above exist to inform that decision, not to describe what your install is
doing right now. The trade it makes is latency: a linger of *N* ms is up to *N*
ms added to every `/track` request that is not in an already-full batch, and the
figures above show larger lingers buying more throughput (5 ms → 1,515,
10 ms → 1,716, 25 ms → 1,904). Whether that latency belongs in the request path
is exactly the open question.

---

## When one api process is not enough

Each api process has its **own Kafka producer**, and therefore its own produce
lane. The batching gain is per-process and multiplies across replicas — adding
api replicas is the intended scaling story, and nothing in the ingest path
requires a single process to reach the 5,000 ev/s target on its own.

What the measurement on this box showed, stated exactly:

- One api at batch 25 / linger 5 ms: **1,515 ev/s**.
- Two apis at the same settings: **1,936 ev/s aggregate** (980 + 955) — **+28%,
  not 2x**.

**+28% is a floor forced by this hardware, not evidence of a shared backend
limit.** The box ran out of CPU. The single api peaked at **127.9% of a core**;
with two apis running, each peaked at only ~**98%** — they got less CPU each, not
more work done each. On four cores that run was carrying two api processes, a
worker peaking at 111–117%, **and two load generators**, on top of Postgres,
Redis, ClickHouse and Redpanda.

Redpanda, ClickHouse and Redis were **not** shown to be the constraint. CPU
exhaustion arrived first and masked whatever is behind it. Establishing a real
per-replica scaling factor needs the load generated off-box, or more cores;
neither was available for these runs. **Do not quote +28% as "the scaling
factor" for OpenPanel** — it is the scaling factor of a 4-core box that was
already full.

---

## Signals you have outgrown one box

These are the three the stack already exposes. Watch all three; any one of them
alone can be a blip.

1. **Kafka consumer lag that stops returning to zero.** Consumer-group lag on
   the events topic (`events`) for the consumer group `openpanel-events`, read
   from the Kafka admin API — the same thing the benchmark harness's
   `lag-monitor.ts` samples. Lag rising during a burst is normal and healthy;
   lag that is still non-zero long after the burst ended means the consumer
   never caught up, and that is the definitive "the box is behind" signal.

2. **Queue and buffer depth gauges that stay non-zero.** On `/metrics`:
   - per BullMQ queue — `<queue>_waiting_count` and `<queue>_active_count`
     (`sessions`, `cron`, `notification`, `import`, `insights`, `gsc`,
     `cohortCompute`);
   - per buffer — `buffer_<name>_count` (`event`, `profile`,
     `profile-backfill`, `session`, `replay`, `group`, `bot`) plus
     `buffer_event_pending_local_count`.

   **These gauges live on the WORKER's `/metrics`, not the api's.** They are
   registered only in a role that consumes — `ROLE=worker` or `ROLE=all` — because
   each gauge costs a Redis round trip per scrape and every api replica exposing
   them would multiply that for no new information. Scrape the api for them and
   you will find nothing and conclude, wrongly, that you are fine.

   Ignore `<queue>_delayed_count`: the cron queue permanently parks its next
   scheduled run there, so a non-zero delayed count is steady state, not a
   backlog.

3. **Rising `/track` P95.** The server-side histogram is
   `http_request_duration_seconds` (labels `method`, `route`, `status_code` — in
   **seconds**), on the api's `/metrics`. Filter to the `/track` route. A P95
   that climbs while your event rate is flat is the request path queueing, which
   on this stack means the produce lane is the thing saturating.

When lag stops draining and queue depth stays off zero at the same time, adding
a second api process is the first move (see above). If lag persists with
multiple apis and the worker's CPU is pinned, the consumer side is the
constraint and the next step is a bigger box or a broker and a ClickHouse that
are not sharing it.

---

## What this page is not

- **Not a cloud capacity model.** Every figure is one node with everything
  co-located: one Postgres, one Redis, one ClickHouse, one Redpanda, the api,
  the worker and the load generator, on 4 cores and 15 GB of RAM. Production
  OpenPanel Cloud runs ClickHouse as 2 shards x 2 replicas; nothing here
  predicts a per-node figure there.
- **A synthetic session shape.** The load comes from one generator on the same
  box, emitting a fixed session pattern. Your events are a different size, a
  different mix, and arrive from the internet rather than from localhost.
- **No V1 comparison.** Nothing here says whether V2 is faster or slower than
  the OpenPanel you are running today. That comparison has not been made.
- **A different box moves every number.** More cores, a managed ClickHouse, or
  an external broker each remove a different one of the constraints these runs
  hit, and the constraint they hit first was CPU on a box doing everything at
  once.

## See also

- [`KAFKA_PRODUCER_OPTIONS.md`](./KAFKA_PRODUCER_OPTIONS.md) — the producer
  knobs, what each one does, and the kafkajs retry coupling.
- [`BENCHMARK_HARNESS.md`](./BENCHMARK_HARNESS.md) — how to reproduce any run on
  this page against your own hardware.
