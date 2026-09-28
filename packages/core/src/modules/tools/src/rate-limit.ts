// Shared in-memory rate limiter for the two public tools endpoints. Ported
// verbatim from apps/api/src/controllers/tools.controller.ts: one process-local
// map, keyed per endpoint by the caller.

// Both endpoints are public and unauthenticated, so a key (one per distinct
// caller IP) that is only ever seen once would otherwise sit in the map
// forever. Sweep expired entries every N calls instead of on a timer, so an
// idle process does no extra work.
const SWEEP_EVERY_N_CALLS = 500;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
let callsSinceSweep = 0;

function sweepExpired(now: number): void {
  for (const [key, record] of rateLimitMap) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  windowMs: number,
  max: number
): boolean {
  const now = Date.now();

  callsSinceSweep++;
  if (callsSinceSweep >= SWEEP_EVERY_N_CALLS) {
    callsSinceSweep = 0;
    sweepExpired(now);
  }

  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= max) {
    return false;
  }

  record.count++;
  return true;
}
