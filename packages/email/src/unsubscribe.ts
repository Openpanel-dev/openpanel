import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Read at call time, not import time, so a missing secret fails the one
 * request that needs it with a clear message instead of silently signing
 * with a well-known default that anyone could forge.
 */
function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.COOKIE_SECRET;
  if (!secret) {
    throw new Error(
      'UNSUBSCRIBE_SECRET or COOKIE_SECRET must be set to sign unsubscribe links',
    );
  }
  return secret;
}

export function generateUnsubscribeToken(email: string, category: string): string {
  const data = `${email}:${category}`;
  return createHmac('sha256', getSecret()).update(data).digest('hex');
}

export function verifyUnsubscribeToken(
  email: string,
  category: string,
  token: string,
): boolean {
  const expectedToken = generateUnsubscribeToken(email, category);
  const tokenBuffer = Buffer.from(token, 'hex');
  const expectedBuffer = Buffer.from(expectedToken, 'hex');

  // Handle length mismatch safely to avoid timing leaks
  if (tokenBuffer.length !== expectedBuffer.length) {
    // Compare against zero-filled buffer of same length as token to maintain constant time
    const zeroBuffer = Buffer.alloc(tokenBuffer.length);
    timingSafeEqual(tokenBuffer, zeroBuffer);
    return false;
  }

  return timingSafeEqual(tokenBuffer, expectedBuffer);
}

export function getUnsubscribeUrl(email: string, category: string): string {
  const token = generateUnsubscribeToken(email, category);
  const params = new URLSearchParams({ email, category, token });
  const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
  return `${dashboardUrl}/unsubscribe?${params.toString()}`;
}
