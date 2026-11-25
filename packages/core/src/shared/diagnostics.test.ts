import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type DiagnosticsRequest,
  diagnosticsDirectory,
  requestDiagnostics,
  startDiagnosticsListener,
} from './diagnostics';
import type { GarbageCollectionResult, MemorySnapshot } from './memory';

const TIMEOUT_MS = 10_000;
const ELEVEN_MINUTES_MS = 11 * 60 * 1000;

const info = mock((_object: object, _message?: string) => undefined);
const warn = mock((_object: object, _message?: string) => undefined);
let stopListening: () => void;

beforeAll(async () => {
  stopListening = await startDiagnosticsListener({ info, warn });
});

afterAll(() => {
  stopListening();
});

async function ask(request: DiagnosticsRequest): Promise<string> {
  const responsePath = await requestDiagnostics(
    process.pid,
    request,
    TIMEOUT_MS
  );
  const body = await Bun.file(responsePath).text();
  await rm(responsePath);
  return body;
}

test('a snapshot reports process, allocator and heap numbers', async () => {
  const snapshot = JSON.parse(
    await ask({ command: 'snapshot', top: 3 })
  ) as MemorySnapshot;

  expect(snapshot.pid).toBe(process.pid);
  expect(snapshot.memory.rss).toBeGreaterThan(0);
  expect(snapshot.memory.allocator.current).toBeGreaterThan(0);
  expect(snapshot.topObjectTypes).toHaveLength(3);
  if (process.platform === 'linux') {
    expect(snapshot.smapsRollup?.Rss).toBeGreaterThan(0);
    expect(snapshot.threads?.length).toBeGreaterThan(0);
  }
  expect(info).toHaveBeenCalled();
});

test('a gc reports allocator numbers before and after', async () => {
  const result = JSON.parse(
    await ask({ command: 'gc' })
  ) as GarbageCollectionResult;

  expect(result.before.allocator.current).toBeGreaterThan(0);
  expect(result.after.allocator.current).toBeGreaterThan(0);
  expect(result.durationMs).toBeGreaterThanOrEqual(0);
});

test('a heap snapshot comes back in the V8 format', async () => {
  const snapshot = JSON.parse(await ask({ command: 'heap-snapshot' })) as {
    snapshot?: unknown;
  };

  expect(snapshot.snapshot).toBeDefined();
});

test('a process without the listener is refused, never signalled', async () => {
  const bystander = Bun.spawn(['bun', '-e', 'setTimeout(() => {}, 10_000)']);
  try {
    await expect(
      requestDiagnostics(bystander.pid, { command: 'gc' }, TIMEOUT_MS)
    ).rejects.toThrow('not listening for diagnostics');
    expect(bystander.exitCode).toBeNull();
    expect(bystander.signalCode).toBeNull();
  } finally {
    bystander.kill();
  }
});

test('an invalid request is answered with an error instead of hanging', async () => {
  const invalid = { command: 'snapshot', top: 0 } as DiagnosticsRequest;

  await expect(ask(invalid)).rejects.toThrow();
  expect(warn).toHaveBeenCalledTimes(1);
});

test('answers nobody collected expire on the next request', async () => {
  const directory = diagnosticsDirectory(process.pid);
  const abandoned = join(directory, 'abandoned.response');
  const fresh = join(directory, 'fresh.response');
  await Bun.write(abandoned, 'late heap snapshot');
  await Bun.write(fresh, 'still being read');
  const elevenMinutesAgo = new Date(Date.now() - ELEVEN_MINUTES_MS);
  await utimes(abandoned, elevenMinutesAgo, elevenMinutesAgo);

  await ask({ command: 'gc' });

  expect(await Bun.file(abandoned).exists()).toBe(false);
  expect(await Bun.file(fresh).exists()).toBe(true);
  await rm(fresh);
});

test('a stopped listener is refused, not signalled', async () => {
  stopListening();

  await expect(
    requestDiagnostics(process.pid, { command: 'gc' }, TIMEOUT_MS)
  ).rejects.toThrow('not listening for diagnostics');
});
