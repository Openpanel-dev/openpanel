import type { ClickHouseClient } from '@clickhouse/client';
import type { ILogger } from '@openpanel/logger';

/**
 * Round-robin selection across multiple ClickHouse clients with simple
 * health tracking and a withRetry wrapper that moves to a different node
 * on connection failures.
 *
 * The Hetzner LB experience taught us that L4 TCP forwarders can add
 * unbounded tail latency. Instead of going through an LB, we now hold a
 * direct connection to each CH node and pick between them ourselves.
 */

export interface ClientSlot {
  client: ClickHouseClient;
  url: string;
  index: number;
}

/**
 * Three buckets of error:
 *
 * - `node-down`: TCP/DNS/CONNECT-level failure. The node is genuinely
 *   unreachable from this worker right now. **Retry on next node AND
 *   sin-bin the failing node** so we don't keep trying it.
 *
 * - `transient`: A live socket got reset, hung up, or timed out mid-stream.
 *   The node itself is almost certainly healthy — it's a stale keep-alive,
 *   a one-off race, or a slow query. **Retry on next node but DO NOT
 *   sin-bin** — penalising the node for a flaky socket throws away a
 *   perfectly good replica.
 *
 * - `ch-server`: The server received and rejected the request (SQL error,
 *   permission, TOO_MANY_PARTS, TIMEOUT_EXCEEDED, MEMORY_LIMIT_EXCEEDED,
 *   etc.). **Propagate immediately, no retry.** The query is wrong or the
 *   cluster is overloaded — retrying on another node wouldn't help.
 *
 * - `other`: Unknown shape. **Propagate, no retry.** Safer to surface than
 *   to risk wrongly handling something we don't recognise.
 */
export type ErrorClass = 'node-down' | 'transient' | 'ch-server' | 'other';

/** TCP/DNS failures — the node is unreachable. */
const NODE_DOWN_CODES = new Set([
  'ECONNREFUSED', // node not listening
  'EHOSTUNREACH', // routing failure
  'EHOSTDOWN', // host explicitly down
  'ENETUNREACH', // network unreachable
  'ETIMEDOUT', // typically a TCP-connect timeout from Node
  'EAI_AGAIN', // transient DNS failure (treat as node unreachable)
  'UND_ERR_CONNECT_TIMEOUT', // undici connect timeout
]);

/** Mid-stream socket issues — the connection was alive but failed. The node
 *  is almost certainly fine; we just lost this particular socket. */
const TRANSIENT_CODES = new Set([
  'ECONNRESET', // peer reset (often a stale keep-alive socket)
  'EPIPE', // write to half-closed socket
  'UND_ERR_SOCKET', // generic undici socket error
  'UND_ERR_HEADERS_TIMEOUT', // server accepted conn but didn't respond in time
  'UND_ERR_BODY_TIMEOUT', // body streaming timed out
  'UND_ERR_RESPONSE_TIMEOUT',
]);

/** Connect-time message keywords — node down. */
const NODE_DOWN_MESSAGE_KEYWORDS = [
  'connect ETIMEDOUT',
  'connect ECONNREFUSED',
  'Connect Timeout Error', // undici
];

/** Mid-stream message keywords — transient socket. */
const TRANSIENT_MESSAGE_KEYWORDS = [
  'socket hang up', // Node http
  'Premature close', // undici stream
  'Headers Timeout Error', // undici
  'Body Timeout Error', // undici
  'Response Timeout Error', // undici
];

/** Bare-code substrings used as a fallback when err.code wasn't propagated
 *  (sometimes happens when libraries re-wrap errors and only keep the
 *  message). Listed separately so the order of classification is
 *  predictable: explicit code first, then message keywords, then bare-code
 *  substring as last resort. */
const NODE_DOWN_BARE_CODE_REGEX =
  /\b(ECONNREFUSED|EHOSTUNREACH|EHOSTDOWN|ENETUNREACH|ETIMEDOUT|EAI_AGAIN)\b/;
const TRANSIENT_BARE_CODE_REGEX = /\b(ECONNRESET|EPIPE)\b/;

/** Match a ClickHouse server error. CH formats every exception as
 *  `Code: NNN. DB::Exception: <text>. (NAMED_CONSTANT)` over the HTTP
 *  interface. SQL errors, TOO_MANY_PARTS, TIMEOUT_EXCEEDED, auth errors —
 *  all of them. */
const CH_SERVER_ERROR_PREFIX = /^Code:\s*\d+/;

export function classifyError(err: unknown): ErrorClass {
  if (!err || typeof err !== 'object') {
    return 'other';
  }
  const e = err as {
    message?: string;
    code?: unknown;
    cause?: unknown;
    type?: unknown;
  };
  const msg = String(e.message ?? '');

  // ── Deny: ClickHouse server errors ────────────────────────────────────
  if (CH_SERVER_ERROR_PREFIX.test(msg)) {
    return 'ch-server';
  }
  if (typeof e.type === 'string' && e.type.startsWith('DB::')) {
    return 'ch-server';
  }

  // ── Explicit error.code wins ──────────────────────────────────────────
  if (typeof e.code === 'string') {
    if (NODE_DOWN_CODES.has(e.code)) return 'node-down';
    if (TRANSIENT_CODES.has(e.code)) return 'transient';
  }

  // ── Message keyword fallback ──────────────────────────────────────────
  if (NODE_DOWN_MESSAGE_KEYWORDS.some((k) => msg.includes(k))) {
    return 'node-down';
  }
  if (TRANSIENT_MESSAGE_KEYWORDS.some((k) => msg.includes(k))) {
    return 'transient';
  }

  // ── Bare-code substring fallback ──────────────────────────────────────
  if (NODE_DOWN_BARE_CODE_REGEX.test(msg)) return 'node-down';
  if (TRANSIENT_BARE_CODE_REGEX.test(msg)) return 'transient';

  // ── Wrapped causes (Node 18+ AggregateError, undici wrapping) ─────────
  if (e.cause) {
    return classifyError(e.cause);
  }

  return 'other';
}

/** Convenience: should we retry this error at all (regardless of whether we
 *  sin-bin the node)? */
export function isRetriableConnectionError(err: unknown): boolean {
  const c = classifyError(err);
  return c === 'node-down' || c === 'transient';
}

export class RoundRobinPicker {
  private rrIndex = 0;
  private unhealthyUntil = new Map<number, number>();

  constructor(
    private readonly clients: ClickHouseClient[],
    private readonly urls: string[],
    /** How long to skip a node after a connection failure, in ms. */
    private readonly unhealthyMarkMs: number
  ) {
    if (clients.length === 0) {
      throw new Error('RoundRobinPicker: at least one client required');
    }
    if (clients.length !== urls.length) {
      throw new Error('RoundRobinPicker: clients and urls must be same length');
    }
  }

  get size(): number {
    return this.clients.length;
  }

  get allUrls(): readonly string[] {
    return this.urls;
  }

  /**
   * Pick the next client in round-robin order. Skips nodes that were
   * recently marked unhealthy. If all are marked unhealthy, returns the
   * next one anyway (the marks might be stale and we'd rather try than
   * fail).
   */
  next(): ClientSlot {
    if (this.clients.length === 1) {
      return { client: this.clients[0]!, url: this.urls[0]!, index: 0 };
    }
    const now = Date.now();
    for (let i = 0; i < this.clients.length; i++) {
      const idx = this.rrIndex;
      this.rrIndex = (this.rrIndex + 1) % this.clients.length;
      const until = this.unhealthyUntil.get(idx);
      if (!until || until <= now) {
        return {
          client: this.clients[idx]!,
          url: this.urls[idx]!,
          index: idx,
        };
      }
    }
    // All nodes are sin-binned — try the next one anyway.
    const idx = this.rrIndex;
    this.rrIndex = (this.rrIndex + 1) % this.clients.length;
    this.unhealthyUntil.delete(idx);
    return { client: this.clients[idx]!, url: this.urls[idx]!, index: idx };
  }

  markUnhealthy(slot: ClientSlot): void {
    if (this.clients.length > 1) {
      this.unhealthyUntil.set(slot.index, Date.now() + this.unhealthyMarkMs);
    }
  }

  markHealthy(slot: ClientSlot): void {
    this.unhealthyUntil.delete(slot.index);
  }

  /** For debugging / metrics — which nodes are currently in the sin bin. */
  getUnhealthySnapshot(): { url: string; until: number }[] {
    const now = Date.now();
    const out: { url: string; until: number }[] = [];
    for (const [idx, until] of this.unhealthyUntil) {
      if (until > now) {
        out.push({ url: this.urls[idx] ?? '?', until });
      }
    }
    return out;
  }
}

/** Context passed to the operation callback so callers can record which
 *  node was actually used (e.g. for logs / metrics). */
export interface OperationContext {
  url: string;
  index: number;
}

/**
 * Run `operation` against the round-robin picker. On a connection error,
 * mark that node unhealthy and try the next one. Non-connection errors
 * (e.g. SQL syntax) propagate immediately — retrying wouldn't help.
 */
export async function withRoundRobinRetry<T>(
  picker: RoundRobinPicker,
  operation: (client: ClickHouseClient, ctx: OperationContext) => Promise<T>,
  logger: ILogger,
  opts: {
    /** Max total attempts (default = picker.size + 1, min 3). */
    maxAttempts?: number;
    /** Base delay for exponential backoff in ms. */
    baseDelayMs?: number;
    /** Cap on backoff delay between attempts. */
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? Math.max(3, picker.size + 1);
  const baseDelayMs = opts.baseDelayMs ?? 200;
  const maxDelayMs = opts.maxDelayMs ?? 2000;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slot = picker.next();
    try {
      const res = await operation(slot.client, {
        url: slot.url,
        index: slot.index,
      });
      if (attempt > 0) {
        picker.markHealthy(slot);
        logger.info(
          { url: slot.url, attempt: attempt + 1 },
          'CH operation succeeded after retry'
        );
      }
      return res;
    } catch (error) {
      lastError = error;

      const errClass = classifyError(error);
      if (errClass === 'ch-server' || errClass === 'other') {
        // SQL/auth/business error or unknown shape — propagate immediately.
        // Retrying wouldn't help and we don't want to wrongly handle
        // unfamiliar errors as transport failures.
        throw error;
      }

      // Only sin-bin nodes that are actually unreachable. A `transient`
      // socket-level error (ECONNRESET, EPIPE, stream timeout) doesn't
      // mean the node is sick — it's a stale keep-alive race or one-off
      // glitch. Penalising the node would throw away a healthy replica.
      if (errClass === 'node-down') {
        picker.markUnhealthy(slot);
      }

      if (attempt === maxAttempts - 1) {
        break;
      }

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      logger.warn(
        {
          err: (error as { message?: string })?.message,
          code: (error as { code?: string })?.code,
          errClass,
          markedUnhealthy: errClass === 'node-down',
          url: slot.url,
          attempt: attempt + 1,
          maxAttempts,
          nextDelayMs: delay,
        },
        errClass === 'node-down'
          ? 'CH node unreachable; sin-binning and retrying on next'
          : 'CH transient socket error; retrying on next'
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
