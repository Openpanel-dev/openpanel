// Postgres-backed login sessions (a `sessions` row keyed by the hash of a
// browser's cookie). Not to be confused with session.service.ts's ClickHouse
// visitor sessions.
//
// Moved from @openpanel/auth (M4-007), split at the Prisma boundary: token
// issuance/hashing lives in @openpanel/core's auth module (no db needed), and
// this half — the part that actually touches `sessions`/`users` — stays here,
// because @openpanel/core cannot depend on @openpanel/db (db already depends
// on core) without a cycle.

import { decodeSessionToken, hashSessionToken } from '@openpanel/core';
import type { Session, User } from '../prisma-client';
import { db } from '../prisma-client';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_RENEWAL_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 15;
const DEMO_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 * 365;
const DEMO_SESSION_ID = '1';

export type SessionValidationResult =
  | { session: Session; user: User; userId: string }
  | { session: null; user: null; userId: null };

export const EMPTY_SESSION: SessionValidationResult = {
  session: null,
  user: null,
  userId: null,
};

export async function createSession(
  token: string,
  userId: string
): Promise<Session> {
  const session: Session = {
    id: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.session.create({
    data: session,
  });
  return session;
}

export async function createDemoSession(
  userId: string
): Promise<SessionValidationResult> {
  const user = await db.user.findUniqueOrThrow({
    where: {
      id: userId,
    },
  });

  return {
    user,
    userId: user.id,
    session: {
      id: DEMO_SESSION_ID,
      userId: user.id,
      expiresAt: new Date(Date.now() + DEMO_SESSION_TTL_MS),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

export async function validateSessionToken(
  token: string | null | undefined
): Promise<SessionValidationResult> {
  if (process.env.DEMO_USER_ID) {
    return createDemoSession(process.env.DEMO_USER_ID);
  }

  if (!token) {
    return EMPTY_SESSION;
  }
  const sessionId = decodeSessionToken(token);
  if (!sessionId) {
    return EMPTY_SESSION;
  }
  const result = await db.session.findUnique({
    where: {
      id: sessionId,
    },
    include: {
      user: true,
    },
  });
  if (result === null) {
    return EMPTY_SESSION;
  }
  const { user, ...session } = result;
  if (Date.now() >= session.expiresAt.getTime()) {
    await db.session.delete({ where: { id: sessionId } });
    return EMPTY_SESSION;
  }
  if (
    Date.now() >=
    session.expiresAt.getTime() - SESSION_RENEWAL_THRESHOLD_MS
  ) {
    session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        expiresAt: session.expiresAt,
      },
    });
  }
  return { session, user, userId: user.id };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.session.delete({ where: { id: sessionId } });
}
