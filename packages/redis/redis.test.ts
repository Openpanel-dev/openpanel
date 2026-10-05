/** The CACHE client must reject promptly when Redis is unreachable, while the queue client keeps BullMQ's retry settings. An unreachable port covers "never connected", a fake RESP server covers "connected, then gone". */

import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CACHE_COMMAND_TIMEOUT_MS,
  createFailFastCacheClient,
  type ExtendedRedis,
  QUEUE_CLIENT_OPTIONS,
} from './redis';

/** ioredis's own cycle is tens of seconds; anything near it is the bug back. */
const PROMPT_WHEN_NEVER_CONNECTED_MS = CACHE_COMMAND_TIMEOUT_MS * 4;
/** A known-down socket must not wait for the timeout at all. */
const INSTANT_WHEN_DISCONNECTED_MS = 100;
const READY_TIMEOUT_MS = 5000;

const INFO_BODY = '# Server\r\nredis_version:7.4.0\r\nloading:0\r\n';

/** Pull every COMPLETE `*N` array of bulk strings out of `buffered`. */
function parseCommands(buffered: string): {
  commands: string[][];
  rest: string;
} {
  const commands: string[][] = [];
  let offset = 0;
  while (offset < buffered.length && buffered[offset] === '*') {
    const headerEnd = buffered.indexOf('\r\n', offset);
    if (headerEnd < 0) {
      break;
    }
    const argCount = Number(buffered.slice(offset + 1, headerEnd));
    let cursor = headerEnd + 2;
    const args: string[] = [];
    let complete = true;
    for (let index = 0; index < argCount; index++) {
      const lengthEnd = buffered.indexOf('\r\n', cursor);
      if (buffered[cursor] !== '$' || lengthEnd < 0) {
        complete = false;
        break;
      }
      const length = Number(buffered.slice(cursor + 1, lengthEnd));
      const start = lengthEnd + 2;
      if (buffered.length < start + length + 2) {
        complete = false;
        break;
      }
      args.push(buffered.slice(start, start + length));
      cursor = start + length + 2;
    }
    if (!complete) {
      break;
    }
    commands.push(args);
    offset = cursor;
  }
  return { commands, rest: buffered.slice(offset) };
}

function replyTo(command: string[]): string {
  const name = (command[0] ?? '').toLowerCase();
  if (name === 'info') {
    return `$${INFO_BODY.length}\r\n${INFO_BODY}\r\n`;
  }
  if (name === 'ping') {
    return '+PONG\r\n';
  }
  if (name === 'get') {
    return '$-1\r\n';
  }
  return '+OK\r\n';
}

interface FakeRedis {
  port: number;
  /** Stop listening and drop every open socket — a `docker stop`, not a blip. */
  vanish(): Promise<void>;
}

function startFakeRedis(): Promise<FakeRedis> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let buffered = '';
    socket.on('error', () => socket.destroy());
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      buffered += chunk.toString('latin1');
      const { commands, rest } = parseCommands(buffered);
      buffered = rest;
      for (const command of commands) {
        socket.write(replyTo(command), 'latin1');
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo;
      resolve({
        port: address.port,
        vanish: () =>
          new Promise((done) => {
            for (const socket of sockets) {
              socket.destroy();
            }
            sockets.clear();
            server.close(() => done());
          }),
      });
    });
  });
}

/** A port nothing is listening on — every connect gets ECONNREFUSED. */
function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * ioredis learns a socket died from the event loop, and a command issued in
 * the same tick is still written to the dead socket and bounded by
 * `commandTimeout` instead. Wait for the client to notice before measuring the
 * instant-rejection property.
 */
async function waitUntilDisconnected(client: ExtendedRedis): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (client.status === 'ready' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function timeRejection(run: () => Promise<unknown>): Promise<{
  ms: number;
  error: Error | null;
}> {
  const startedAt = performance.now();
  try {
    await run();
    return { ms: performance.now() - startedAt, error: null };
  } catch (error) {
    return { ms: performance.now() - startedAt, error: error as Error };
  }
}

const clients: ExtendedRedis[] = [];
function track(client: ExtendedRedis): ExtendedRedis {
  clients.push(client);
  return client;
}

afterEach(() => {
  while (clients.length > 0) {
    clients.pop()?.disconnect();
  }
});

describe('cache client fail-fast (M18-003)', () => {
  it('rejects within the command timeout when Redis was never reachable', async () => {
    const port = await unusedPort();
    const client = track(
      createFailFastCacheClient(
        'test-never-reachable',
        `redis://127.0.0.1:${port}`
      )
    );

    const { ms, error } = await timeRejection(() => client.get('any-key'));

    expect(error).toBeInstanceOf(Error);
    expect(ms).toBeLessThan(PROMPT_WHEN_NEVER_CONNECTED_MS);
  });

  it('does NOT reject commands issued before the first connect completes', async () => {
    const fake = await startFakeRedis();
    try {
      const client = track(
        createFailFastCacheClient(
          'test-boot-order',
          `redis://127.0.0.1:${fake.port}`
        )
      );

      // Same tick as construction — the boot-ordering case. With the offline
      // queue off from the start ioredis would answer "Stream isn't writeable".
      await expect(client.get('any-key')).resolves.toBeNull();
    } finally {
      await fake.vanish();
    }
  });

  it('rejects instantly once a connected server goes away', async () => {
    const fake = await startFakeRedis();
    const client = track(
      createFailFastCacheClient(
        'test-connected-then-gone',
        `redis://127.0.0.1:${fake.port}`
      )
    );

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('client never became ready')),
        READY_TIMEOUT_MS
      );
      client.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await expect(client.get('any-key')).resolves.toBeNull();

    await fake.vanish();
    await waitUntilDisconnected(client);

    const { ms, error } = await timeRejection(() => client.get('any-key'));

    expect(error).toBeInstanceOf(Error);
    // Not "within the timeout" — a known-down socket must not wait at all.
    expect(ms).toBeLessThan(INSTANT_WHEN_DISCONNECTED_MS);
  });

  it('leaves the queue client on BullMQ’s mandated settings', () => {
    expect(QUEUE_CLIENT_OPTIONS.maxRetriesPerRequest).toBeNull();
    expect(QUEUE_CLIENT_OPTIONS.enableOfflineQueue).toBe(true);
    expect(QUEUE_CLIENT_OPTIONS.enableReadyCheck).toBe(false);
    expect(QUEUE_CLIENT_OPTIONS.commandTimeout).toBeUndefined();
  });
});

describe('MULTI under fail-fast (the M18-001 shutdown contract)', () => {
  /**
   * `event-buffer.ts` decides whether the events it holds are durable from
   * whether `multi().exec()` threw — and `apps/api/src/shutdown.ts` refuses to
   * finish the shutdown when it did, so Kafka redelivers instead of the events
   * being lost. ioredis RESOLVES a MULTI whose individual commands failed, so
   * "rejects" is the property that keeps a fast refusal from reading as a
   * successful flush.
   */
  it('rejects rather than resolving with per-command errors', async () => {
    const fake = await startFakeRedis();
    const client = track(
      createFailFastCacheClient(
        'test-multi-after-vanish',
        `redis://127.0.0.1:${fake.port}`
      )
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('client never became ready')),
        READY_TIMEOUT_MS
      );
      client.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    await fake.vanish();
    await waitUntilDisconnected(client);

    const { ms, error } = await timeRejection(() =>
      client.multi().rpush('event_buffer:queue', 'an-event').exec()
    );

    expect(error).toBeInstanceOf(Error);
    expect(ms).toBeLessThan(INSTANT_WHEN_DISCONNECTED_MS);
  });
});
