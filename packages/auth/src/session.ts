import crypto from 'node:crypto';
import { type Session, type User, db } from '@openpanel/db';
import { sha256 } from '@oslojs/crypto/sha2';
import {
  encodeBase32LowerCaseNoPadding,
  encodeHexLowerCase,
} from '@oslojs/encoding';

export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const token = encodeBase32LowerCaseNoPadding(bytes);
  return token;
}

export async function createSession(
  token: string,
  userId: string,
): Promise<Session> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const session: Session = {
    id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.session.create({
    data: session,
  });
  return session;
}

export const EMPTY_SESSION: SessionValidationResult = {
  session: null,
  user: null,
  userId: null,
};

export async function createDemoSession(
  userId: string,
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
      id: '1',
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30 * 365),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

export async function validateSessionToken(
  token: string | null,
): Promise<SessionValidationResult> {
  if (process.env.DEMO_USER_ID) {
    return createDemoSession(process.env.DEMO_USER_ID);
  }

  if (!token) {
    return EMPTY_SESSION;
  }
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
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
  if (Date.now() >= session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
    session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
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

export type SessionValidationResult =
  | { session: Session; user: User; userId: string }
  | { session: null; user: null; userId: null };
