import { createHmac } from 'crypto';

const SECRET =
  process.env.UNSUBSCRIBE_SECRET ||
  process.env.COOKIE_SECRET ||
  process.env.SECRET ||
  'default-secret-change-in-production';

export function generateUnsubscribeToken(email: string, category: string): string {
  const data = `${email}:${category}`;
  return createHmac('sha256', SECRET).update(data).digest('hex');
}

export function verifyUnsubscribeToken(
  email: string,
  category: string,
  token: string,
): boolean {
  const expectedToken = generateUnsubscribeToken(email, category);
  return token === expectedToken;
}

export function getUnsubscribeUrl(email: string, category: string): string {
  const token = generateUnsubscribeToken(email, category);
  const params = new URLSearchParams({ email, category, token });
  const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
  return `${dashboardUrl}/unsubscribe?${params.toString()}`;
}
