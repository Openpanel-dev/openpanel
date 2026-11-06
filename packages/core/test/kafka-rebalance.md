# Kafka rebalance regression

The test starts two or three **separate Bun processes** running the real
`createEventsBatchHandler` and `EventBuffer`. A controlled handler buffers
synthetic business events, with four serial keys on one partition. Joining
another consumer while a batch is in flight forces a group rebalance.

Kafka delivery coordinates are recorded independently of the event buffer.
The test requires an observed rebalance **and repeat deliveries**, then compares
Kafka's committed offset, unique coordinates, physical ClickHouse rows, event
ids and `properties.seq`. Correct counts after a quiet startup aren't enough.
The ClickHouse fixture deliberately uses a plain MergeTree so background merges
cannot hide duplicate inserts. This isolates Kafka → Redis handoff; it doesn't
exercise API validation, sessions, Postgres or production materialized views.

## Run

Use an otherwise idle, dedicated test stack. The test clears `event_buffer:*`
on Redis at `127.0.0.1:23379`; don't point an API/worker at that Redis while it
runs. Kafka is fixed to `127.0.0.1:29092`, ClickHouse to the test endpoint
`127.0.0.1:23123`. Each test creates and removes its own topic, group and
ClickHouse database under the shared test-database prefix.

From the repository root:

```sh
docker compose -p openpanel-rebalance-test -f packages/core/test/kafka-rebalance.compose.yml up -d --wait
cd packages/core
RUN_KAFKA_REBALANCE_TESTS=1 bun test --isolate src/modules/ingest/src/consumer.rebalance.integration.test.ts
```

Optionally set `KAFKA_REBALANCE_RESULTS` to a local directory to retain JSON
summaries, per-delivery coordinates and child-process logs. Without the opt-in,
the broker integration tests are skipped. The regular consumer and event-buffer
regressions run without Kafka.

Stop the dedicated stack from the repository root:

```sh
docker compose -p openpanel-rebalance-test -f packages/core/test/kafka-rebalance.compose.yml down
```

The Compose file uses prebuilt images and builds no application code. Native
Kafka 3.9.1 (KRaft, `group.initial.rebalance.delay.ms=0`), Redis 7.2.5 with AOF and
ClickHouse 26.1.3.52 on the same loopback ports can also run the test.

## Delivery boundary

A heartbeat error stops new work in the batch, waits for sibling handlers and
closes the durability window before KafkaJS rejoins. Kafka can still redeliver
an event already in Redis. Consumer-produced events therefore atomically enqueue
with a project/event-id marker; a refused queue write cannot leave a claim.
Older envelopes get deterministic ids from topic/partition/offset, and derived
`session_start` rows get a separate stable id.

Markers expire after one hour. This adds one expiring Redis key per distinct
consumer-produced row in that window; capacity must include that overhead.
Long-delayed replays or lost/evicted Redis state can produce duplicates. The
ClickHouse insert → Redis trim crash window is also unchanged. This is bounded
rebalance deduplication, not an end-to-end exactly-once guarantee. During a rolling
deploy, old workers still use unconditional enqueue; the protection is complete
only once all consumers run the new code.
