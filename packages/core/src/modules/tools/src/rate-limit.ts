// Shared in-memory rate limiter for the two public tools endpoints. Ported
// verbatim from apps/api/src/controllers/tools.controller.ts (M7-008): one
// process-local map, keyed per endpoint by the caller.

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  windowMs: number,
  max: number
): boolean {
  const now = Date.now();
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
