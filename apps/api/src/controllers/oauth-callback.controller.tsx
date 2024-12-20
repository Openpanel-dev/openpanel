import {
  Arctic,
  type OAuth2Tokens,
  createSession,
  generateSessionToken,
  github,
  google,
  setSessionTokenCookie,
} from '@openpanel/auth';
import { type User, connectUserToOrganization, db } from '@openpanel/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

async function getGithubEmail(githubAccessToken: string) {
  const emailListRequest = new Request('https://api.github.com/user/emails');
  emailListRequest.headers.set('Authorization', `Bearer ${githubAccessToken}`);
  const emailListResponse = await fetch(emailListRequest);
  const emailListResult: unknown = await emailListResponse.json();
  if (!Array.isArray(emailListResult) || emailListResult.length < 1) {
    return null;
  }
  let email: string | null = null;
  for (const emailRecord of emailListResult) {
    const emailParser = z.object({
      primary: z.boolean(),
      verified: z.boolean(),
      email: z.string(),
    });
    const emailResult = emailParser.safeParse(emailRecord);
    if (!emailResult.success) {
      continue;
    }
    if (emailResult.data.primary && emailResult.data.verified) {
      email = emailResult.data.email;
    }
  }
  return email;
}

export async function githubCallback(
  req: FastifyRequest<{
    Querystring: {
      code: string;
      state: string;
    };
  }>,
  reply: FastifyReply,
) {
  const schema = z.object({
    code: z.string(),
    state: z.string(),
    inviteId: z.string().nullish(),
  });

  const query = schema.safeParse(req.query);
  if (!query.success) {
    return reply.status(400).send(query.error.message);
  }
  const { code, state, inviteId } = query.data;
  const storedState = req.cookies.github_oauth_state ?? null;

  if (code === null || state === null || storedState === null) {
    return new Response('Please restart the process.', {
      status: 400,
    });
  }
  if (state !== storedState) {
    return new Response('Please restart the process.', {
      status: 400,
    });
  }

  let tokens: OAuth2Tokens;
  try {
    tokens = await github.validateAuthorizationCode(code);
  } catch {
    // Invalid code or client credentials
    return new Response('Please restart the process.', {
      status: 400,
    });
  }
  const githubAccessToken = tokens.accessToken();

  const userRequest = new Request('https://api.github.com/user');
  userRequest.headers.set('Authorization', `Bearer ${githubAccessToken}`);
  const userResponse = await fetch(userRequest);

  const userSchema = z.object({
    id: z.number(),
    login: z.string(),
    name: z.string(),
  });
  const userJson = await userResponse.json();

  const userResult = userSchema.safeParse(userJson);
  if (!userResult.success) {
    return reply.status(400).send(userResult.error.message);
  }
  const githubUserId = userResult.data.id;
  const email = await getGithubEmail(githubAccessToken);

  const existingUser = await db.account.findFirst({
    where: {
      OR: [
        {
          provider: 'github',
          providerId: String(githubUserId),
        },
        {
          provider: 'oauth',
          user: {
            email: email ?? '',
          },
        },
      ],
    },
  });

  if (existingUser !== null) {
    const sessionToken = generateSessionToken();
    const session = await createSession(sessionToken, existingUser.userId);

    if (existingUser.provider === 'oauth') {
      await db.account.update({
        where: {
          id: existingUser.id,
        },
        data: {
          provider: 'github',
          providerId: String(githubUserId),
        },
      });
    } else if (existingUser.provider !== 'github') {
      await db.account.create({
        data: {
          provider: 'github',
          providerId: String(githubUserId),
          user: {
            connect: {
              id: existingUser.userId,
            },
          },
        },
      });
    }

    setSessionTokenCookie(
      (...args) => reply.setCookie(...args),
      sessionToken,
      session.expiresAt,
    );
    return reply.status(302).redirect(process.env.NEXT_PUBLIC_DASHBOARD_URL!);
  }

  if (email === null) {
    return reply.status(400).send('Please verify your GitHub email address.');
  }

  // (githubUserId, email, username);
  const user = await await db.user.create({
    data: {
      email,
      firstName: userResult.data.name,
      accounts: {
        create: {
          provider: 'github',
          providerId: String(githubUserId),
        },
      },
    },
  });

  if (inviteId) {
    try {
      await connectUserToOrganization({ user, inviteId });
    } catch (error) {
      req.log.error(
        error instanceof Error
          ? error.message
          : 'Unknown error connecting user to projects',
        {
          inviteId,
          email: user.email,
          error,
        },
      );
    }
  }

  const sessionToken = generateSessionToken();
  const session = await createSession(sessionToken, user.id);
  setSessionTokenCookie(
    (...args) => reply.setCookie(...args),
    sessionToken,
    session.expiresAt,
  );
  return reply.status(302).redirect(process.env.NEXT_PUBLIC_DASHBOARD_URL!);
}

export async function googleCallback(
  req: FastifyRequest<{
    Querystring: {
      code: string;
      state: string;
    };
  }>,
  reply: FastifyReply,
) {
  const schema = z.object({
    code: z.string(),
    state: z.string(),
    inviteId: z.string().nullish(),
  });

  const query = schema.safeParse(req.query);
  if (!query.success) {
    return reply.status(400).send(query.error.message);
  }

  const { code, state, inviteId } = query.data;
  const storedState = req.cookies.google_oauth_state ?? null;
  const codeVerifier = req.cookies.google_code_verifier ?? null;

  if (
    code === null ||
    state === null ||
    storedState === null ||
    codeVerifier === null
  ) {
    return reply.status(400).send('Please restart the process.');
  }
  if (state !== storedState) {
    return reply.status(400).send('Please restart the process.');
  }

  let tokens: OAuth2Tokens;
  try {
    tokens = await google.validateAuthorizationCode(code, codeVerifier);
  } catch {
    return reply.status(400).send('Please restart the process.');
  }

  const claims = Arctic.decodeIdToken(tokens.idToken());

  const claimsParser = z.object({
    sub: z.string(),
    given_name: z.string(),
    family_name: z.string(),
    picture: z.string(),
    email: z.string(),
  });

  const claimsResult = claimsParser.safeParse(claims);
  if (!claimsResult.success) {
    return reply.status(400).send(claimsResult.error.message);
  }

  const { sub: googleId, given_name, family_name, email } = claimsResult.data;

  const existingAccount = await db.account.findFirst({
    where: {
      OR: [
        {
          provider: 'google',
          providerId: googleId,
        },
        {
          provider: 'oauth',
          user: {
            email,
          },
        },
      ],
    },
  });

  if (existingAccount !== null) {
    const sessionToken = generateSessionToken();
    const session = await createSession(sessionToken, existingAccount.userId);

    if (existingAccount.provider === 'oauth') {
      await db.account.update({
        where: {
          id: existingAccount.id,
        },
        data: {
          provider: 'google',
          providerId: googleId,
        },
      });
    } else if (existingAccount.provider !== 'google') {
      await db.account.create({
        data: {
          provider: 'google',
          providerId: googleId,
          user: {
            connect: {
              id: existingAccount.userId,
            },
          },
        },
      });
    }

    setSessionTokenCookie(
      (...args) => reply.setCookie(...args),
      sessionToken,
      session.expiresAt,
    );
    return reply.status(302).redirect(process.env.NEXT_PUBLIC_DASHBOARD_URL!);
  }

  const user = await db.user.upsert({
    where: {
      email,
    },
    update: {
      firstName: given_name,
      lastName: family_name,
    },
    create: {
      email,
      firstName: given_name,
      lastName: family_name,
      accounts: {
        create: {
          provider: 'google',
          providerId: googleId,
        },
      },
    },
  });

  if (inviteId) {
    try {
      await connectUserToOrganization({ user, inviteId });
    } catch (error) {
      req.log.error(
        error instanceof Error
          ? error.message
          : 'Unknown error connecting user to projects',
        {
          inviteId,
          email: user.email,
          error,
        },
      );
    }
  }

  const sessionToken = generateSessionToken();
  const session = await createSession(sessionToken, user.id);
  setSessionTokenCookie(
    (...args) => reply.setCookie(...args),
    sessionToken,
    session.expiresAt,
  );
  return reply.status(302).redirect(process.env.NEXT_PUBLIC_DASHBOARD_URL!);
}
