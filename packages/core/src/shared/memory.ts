// Operator diagnostics for "is this process leaking?". Bun keeps freed heap
// pages committed and reuses them, so RSS sits at its high-water mark even after
// a full GC: a leak is RSS or heapUsed still climbing past an earlier peak, not
// RSS failing to drop once.

import { hostname } from 'node:os';

const DEFAULT_TOP_OBJECT_TYPES = 25;

// `apps/start`, `@openpanel/email` and `@openpanel/redis` typecheck this source
// without Bun's types, so the runtime is typed here and `bun:jsc` is imported
// by a specifier TypeScript does not resolve.
const BUN_JSC_MODULE = 'bun:jsc';

interface BunJsc {
  heapStats(): {
    objectCount: number;
    objectTypeCounts: Record<string, number>;
  };
}

interface BunRuntime {
  gc(force: boolean): void;
  generateHeapSnapshot(format: 'v8'): string;
}

function bunRuntime(): BunRuntime {
  return (globalThis as unknown as { Bun: BunRuntime }).Bun;
}

export interface MemoryReading {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

export interface MemorySnapshot extends MemoryReading {
  host: string;
  uptimeSeconds: number;
  objectCount: number;
  topObjectTypes: { type: string; count: number }[];
}

export interface GarbageCollectionResult {
  host: string;
  durationMs: number;
  before: MemoryReading;
  after: MemoryReading;
  freed: MemoryReading;
}

function readMemory(): MemoryReading {
  const { rss, heapUsed, heapTotal, external, arrayBuffers } =
    process.memoryUsage();
  return { rss, heapUsed, heapTotal, external, arrayBuffers };
}

/** Walks the whole JS heap to count objects by type. */
export async function readMemorySnapshot(
  topObjectTypes = DEFAULT_TOP_OBJECT_TYPES
): Promise<MemorySnapshot> {
  const { heapStats } = (await import(BUN_JSC_MODULE)) as BunJsc;
  const stats = heapStats();
  const ranked = Object.entries(stats.objectTypeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topObjectTypes);

  return {
    host: hostname(),
    uptimeSeconds: Math.round(process.uptime()),
    ...readMemory(),
    objectCount: stats.objectCount,
    topObjectTypes: ranked,
  };
}

/** A synchronous full collection; blocks the event loop while it runs. */
export function collectGarbage(): GarbageCollectionResult {
  const before = readMemory();
  const startedAt = performance.now();
  bunRuntime().gc(true);
  const durationMs = Math.round(performance.now() - startedAt);
  const after = readMemory();

  return {
    host: hostname(),
    durationMs,
    before,
    after,
    freed: {
      rss: before.rss - after.rss,
      heapUsed: before.heapUsed - after.heapUsed,
      heapTotal: before.heapTotal - after.heapTotal,
      external: before.external - after.external,
      arrayBuffers: before.arrayBuffers - after.arrayBuffers,
    },
  };
}

/** V8 format, which Chrome DevTools' Memory tab loads. Blocks while it runs. */
export function generateHeapSnapshot(): string {
  return bunRuntime().generateHeapSnapshot('v8');
}
