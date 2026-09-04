// Moved from packages/db/src/services/auth-session.service.ts (M8-005).
// Postgres-backed login sessions (a `sessions` row keyed by the hash of a
// browser's cookie). Not to be confused with session.service.ts's ClickHouse
// visitor sessions.
//
// Originally split at the Prisma boundary (M4-007) on the belief that a
// static `@openpanel/db` import here would cycle with db's own (static)
// `@openpanel/core` imports. `loadDb()` below is the same lazy pattern
// salt.service.ts and registration.ts already use to reach db's Prisma
// client with no such cycle — auth.service.ts's own `loadAuthSession()`
// already reached this file that way, so the move only changes where the
// file lives, not how its caller loads it.
//
// db access is LAZY, not a static top-level import — see salt.service.ts's
// header for the full reasoning (jobs.registry.ts and services.ts pull this
// module into the eager barrel chain nearly every core test file reaches,
// and constructing @openpanel/db's clients at import time would spawn a
// pino-pretty transport worker thread per test file).

import type { Session, User } from '@openpanel/db/src/prisma-client';
import { decodeSessionToken, hashSessionToken } from './token';

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

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

export async function createSession(
  token: string,
  userId: string
): Promise<Session> {
  const db = await loadDb();
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
  const db = await loadDb();
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
  const db = await loadDb();
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
  const db = await loadDb();
  await db.session.delete({ where: { id: sessionId } });
}
