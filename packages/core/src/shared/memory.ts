// Operator diagnostics for "is this process leaking?". Bun keeps freed heap
// pages committed and reuses them, so RSS sits at its high-water mark even after
// a full GC: a leak is RSS or heapUsed still climbing past an earlier peak, not
// RSS failing to drop once. `heapUsed` only covers this thread's JS heap.

import { readdir } from 'node:fs/promises';
import { hostname } from 'node:os';

const DEFAULT_TOP_OBJECT_TYPES = 25;
const BYTES_PER_KB = 1024;
// USER_HZ, the unit of /proc/<pid>/stat CPU times on every Linux Bun ships for.
const CLOCK_TICKS_PER_SECOND = 100;
// /proc/<pid>/task/<tid>/stat fields after the `(comm)` one: state is field 3,
// utime 14 and stime 15.
const STAT_UTIME_INDEX = 11;
const STAT_STIME_INDEX = 12;
const SMAPS_LINE = /^(\w+):\s+(\d+) kB$/;

// `apps/start`, `@openpanel/email` and `@openpanel/redis` typecheck this source
// without Bun's types, so the runtime is typed here and `bun:jsc` is imported
// by a specifier TypeScript does not resolve.
const BUN_JSC_MODULE = 'bun:jsc';

/**
 * mimalloc's process info, in bytes: `current`/`peak` are RSS, not live
 * allocations; `currentCommit` is what mimalloc holds committed, freed or not.
 */
export interface AllocatorUsage {
  current: number;
  peak: number;
  currentCommit: number;
  peakCommit: number;
  pageFaults: number;
}

interface BunJsc {
  heapStats(): {
    objectCount: number;
    objectTypeCounts: Record<string, number>;
  };
  memoryUsage(): AllocatorUsage;
}

interface BunRuntime {
  version: string;
  gc(force: boolean): void;
  generateHeapSnapshot(format: 'v8'): string;
  file(path: string): { text(): Promise<string> };
}

function bunRuntime(): BunRuntime {
  return (globalThis as unknown as { Bun: BunRuntime }).Bun;
}

async function bunJsc(): Promise<BunJsc> {
  return (await import(BUN_JSC_MODULE)) as BunJsc;
}

export interface MemoryReading {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  allocator: AllocatorUsage;
}

export interface ThreadCpu {
  tid: number;
  name: string;
  cpuSeconds: number;
}

export interface MemorySnapshot {
  host: string;
  pid: number;
  bunVersion: string;
  uptimeSeconds: number;
  memory: MemoryReading;
  /** /proc/self/smaps_rollup in bytes; null off Linux. */
  smapsRollup: Record<string, number> | null;
  /** CPU per thread since start; null off Linux. */
  threads: ThreadCpu[] | null;
  objectCount: number;
  topObjectTypes: { type: string; count: number }[];
}

export interface GarbageCollectionResult {
  host: string;
  pid: number;
  durationMs: number;
  before: MemoryReading;
  after: MemoryReading;
}

async function readMemory(): Promise<MemoryReading> {
  const { rss, heapUsed, heapTotal, external } = process.memoryUsage();
  const allocator = (await bunJsc()).memoryUsage();
  return { rss, heapUsed, heapTotal, external, allocator };
}

async function readProcFile(path: string): Promise<string | null> {
  try {
    return await bunRuntime().file(path).text();
  } catch {
    return null;
  }
}

async function readSmapsRollup(): Promise<Record<string, number> | null> {
  const text = await readProcFile('/proc/self/smaps_rollup');
  if (text === null) {
    return null;
  }
  const bytes: Record<string, number> = {};
  for (const line of text.split('\n')) {
    const match = SMAPS_LINE.exec(line);
    if (match?.[1] && match[2]) {
      bytes[match[1]] = Number(match[2]) * BYTES_PER_KB;
    }
  }
  return bytes;
}

function parseThreadCpuSeconds(stat: string): number {
  // comm may contain spaces and parentheses, so fields are counted from the last `)`.
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const ticks =
    Number(fields[STAT_UTIME_INDEX]) + Number(fields[STAT_STIME_INDEX]);
  return ticks / CLOCK_TICKS_PER_SECOND;
}

async function readThreads(): Promise<ThreadCpu[] | null> {
  let tids: string[];
  try {
    tids = await readdir('/proc/self/task');
  } catch {
    return null;
  }
  const threads: ThreadCpu[] = [];
  for (const tid of tids) {
    const [name, stat] = await Promise.all([
      readProcFile(`/proc/self/task/${tid}/comm`),
      readProcFile(`/proc/self/task/${tid}/stat`),
    ]);
    // A thread can exit between readdir and the reads.
    if (name === null || stat === null) {
      continue;
    }
    threads.push({
      tid: Number(tid),
      name: name.trim(),
      cpuSeconds: parseThreadCpuSeconds(stat),
    });
  }
  return threads.sort((a, b) => b.cpuSeconds - a.cpuSeconds);
}

/** Walks the whole JS heap to count objects by type; blocks while it runs. */
export async function readMemorySnapshot(
  topObjectTypes = DEFAULT_TOP_OBJECT_TYPES
): Promise<MemorySnapshot> {
  const stats = (await bunJsc()).heapStats();
  const ranked = Object.entries(stats.objectTypeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topObjectTypes);

  const [memory, smapsRollup, threads] = await Promise.all([
    readMemory(),
    readSmapsRollup(),
    readThreads(),
  ]);

  return {
    host: hostname(),
    pid: process.pid,
    bunVersion: bunRuntime().version,
    uptimeSeconds: Math.round(process.uptime()),
    memory,
    smapsRollup,
    threads,
    objectCount: stats.objectCount,
    topObjectTypes: ranked,
  };
}

/** A synchronous full collection; blocks the event loop while it runs. */
export async function collectGarbage(): Promise<GarbageCollectionResult> {
  const before = await readMemory();
  const startedAt = performance.now();
  bunRuntime().gc(true);
  const durationMs = Math.round(performance.now() - startedAt);
  const after = await readMemory();

  return { host: hostname(), pid: process.pid, durationMs, before, after };
}

/** V8 format, which Chrome DevTools' Memory tab loads. Blocks while it runs. */
export function generateHeapSnapshot(): string {
  return bunRuntime().generateHeapSnapshot('v8');
}
