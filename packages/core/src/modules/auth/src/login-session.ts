// Moved from packages/db/src/services/auth-session.service.ts. Postgres-backed
// login sessions (a `sessions` row keyed by the hash of a browser's cookie).
// Not to be confused with session.service.ts's ClickHouse visitor sessions.
//
// Every function takes `ServiceDeps` and reaches Postgres as `deps.db`; the
// `loadDb` lazy loader is gone. `http/session.ts`'s `resolveSession` already
// carried an (until-now-unused) `AppDeps` for exactly this.

import type { Session, User } from '@openpanel/db/src/prisma-client';
import type { ServiceDeps } from '../../../services';
import { EMPTY_SESSION } from '../../../shared/session';
import { decodeSessionToken, hashSessionToken } from './token';

/** Only Postgres — narrowed so `AppDeps` (http/session.ts, before
 *  `ServiceDeps.queues` exists) satisfies it with no cast. */
type LoginSessionDeps = Pick<ServiceDeps, 'db' | 'config'>;

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_RENEWAL_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 15;
const DEMO_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 * 365;
const DEMO_SESSION_ID = '1';

export type SessionValidationResult =
  | { session: Session; user: User; userId: string }
  | { session: null; user: null; userId: null };

export async function createSession(
  deps: LoginSessionDeps,
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
  await deps.db.session.create({
    data: session,
  });
  return session;
}

export async function createDemoSession(
  deps: LoginSessionDeps,
  userId: string
): Promise<SessionValidationResult> {
  const user = await deps.db.user.findUniqueOrThrow({
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
  deps: LoginSessionDeps,
  token: string | null | undefined
): Promise<SessionValidationResult> {
  const demoUserId = deps.config.demoUserId;
  if (demoUserId) {
    return createDemoSession(deps, demoUserId);
  }

  if (!token) {
    return EMPTY_SESSION;
  }
  const sessionId = decodeSessionToken(token);
  if (!sessionId) {
    return EMPTY_SESSION;
  }
  const result = await deps.db.session.findUnique({
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
    await deps.db.session.delete({ where: { id: sessionId } });
    return EMPTY_SESSION;
  }
  if (
    Date.now() >=
    session.expiresAt.getTime() - SESSION_RENEWAL_THRESHOLD_MS
  ) {
    session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await deps.db.session.update({
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

export async function invalidateSession(
  deps: LoginSessionDeps,
  sessionId: string
): Promise<void> {
  await deps.db.session.delete({ where: { id: sessionId } });
}
