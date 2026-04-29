import { hashPassword, verifyPassword } from '@openpanel/common/server';
import { getCache } from '@openpanel/redis';
import crypto from 'node:crypto';
import { db } from '../prisma-client';

export const PAT_PREFIX = 'opat_';

export function generatePATToken(): string {
  return `${PAT_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
}

export async function createPersonalAccessToken({
  name,
  userId,
  organizationId,
  expiresAt,
}: {
  name: string;
  userId: string;
  organizationId: string;
  expiresAt?: Date;
}) {
  const plainToken = generatePATToken();
  const hashed = await hashPassword(plainToken);

  const pat = await db.personalAccessToken.create({
    data: {
      name,
      secret: hashed,
      userId,
      organizationId,
      expiresAt: expiresAt ?? null,
    },
  });

  // Return plain token only at creation time
  return { ...pat, token: plainToken };
}

export async function listPersonalAccessTokens({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  return db.personalAccessToken.findMany({
    where: { userId, organizationId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deletePersonalAccessToken({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  return db.personalAccessToken.deleteMany({
    where: { id, userId },
  });
}

export async function validatePersonalAccessToken(
  token: string,
): Promise<{ userId: string; organizationId: string } | null> {
  if (!token.startsWith(PAT_PREFIX)) return null;

  // Cache key uses a hash of the token to avoid storing it in Redis
  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  return getCache(
    `pat:auth:${tokenHash}`,
    60 * 5,
    async () => {
      const tokens = await db.personalAccessToken.findMany({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true, secret: true, userId: true, organizationId: true },
        // We can't query by hashed token directly, so we query recent ones
        // In practice orgs have few PATs — this list is small
        orderBy: { createdAt: 'desc' },
        take: 200,
      });

      for (const pat of tokens) {
        const match = await verifyPassword(token, pat.secret);
        if (match) {
          // Update lastUsedAt asynchronously
          db.personalAccessToken
            .update({
              where: { id: pat.id },
              data: { lastUsedAt: new Date() },
            })
            .catch(() => {});

          return { userId: pat.userId, organizationId: pat.organizationId };
        }
      }
      return null;
    },
    true,
  );
}
