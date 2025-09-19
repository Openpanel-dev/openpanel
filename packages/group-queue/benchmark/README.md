# Queue Performance Benchmarks

This directory contains performance benchmarks comparing the simple-queue implementation with BullMQ.

## Prerequisites

- Redis server running on localhost:6379 (or set `REDIS_URL` environment variable)
- All dependencies installed: `pnpm install`

## Running Benchmarks

### Compare Both Queues (Recommended)
```bash
pnpm benchmark
```

This runs both benchmarks sequentially and provides a detailed comparison.

### Run Individual Benchmarks

**Simple Queue only:**
```bash
pnpm benchmark:simple
```

**BullMQ only:**
```bash
pnpm benchmark:bullmq
```

## What the Benchmark Tests

- **Duration**: 10 seconds of continuous job processing
- **Job Pattern**: Jobs are distributed across 10 groups for parallelism testing
- **Metrics Measured**:
  - Jobs enqueued per second
  - Jobs processed per second  
  - Processing efficiency (% of enqueued jobs that were processed)
  - Overall throughput

## Architecture Differences

### Simple Queue
- Built-in group-based FIFO ordering
- Single Redis connection per worker
- Custom Lua scripts for atomic operations
- Visibility timeout with automatic reclaim

### BullMQ
- Uses multiple queues to simulate groups
- More Redis connections (per queue/worker/events)
- Battle-tested with many features
- Built on Redis Streams and sorted sets

## Interpreting Results

The benchmark shows:
- **Raw performance**: Jobs/second throughput
- **Efficiency**: How well each queue handles the producer/consumer balance
- **Resource usage**: Implicit in connection patterns and Redis operations

Results may vary based on:
- Redis server performance
- Network latency
- System resources
- Node.js version
