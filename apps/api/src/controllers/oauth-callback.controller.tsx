import { LogError } from '@/utils/errors';
import {
  Arctic,
  type OAuth2Tokens,
  createSession,
  generateSessionToken,
  github,
  google,
  setSessionTokenCookie,
} from '@openpanel/auth';
import { type Account, connectUserToOrganization, db } from '@openpanel/db';
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

// New types and interfaces
type Provider = 'github' | 'google';
interface OAuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
}

// Shared utility functions
async function handleExistingUser({
  account,
  oauthUser,
  providerName,
  reply,
}: {
  account: Account;
  oauthUser: OAuthUser;
  providerName: Provider;
  reply: FastifyReply;
}) {
  const sessionToken = generateSessionToken();
  const session = await createSession(sessionToken, account.userId);

  await db.account.update({
    where: { id: account.id },
    data: {
      provider: providerName,
      providerId: oauthUser.id,
      email: oauthUser.email,
    },
  });

  setSessionTokenCookie(
    (...args) => reply.setCookie(...args),
    sessionToken,
    session.expiresAt,
  );
  return reply.redirect(process.env.NEXT_PUBLIC_DASHBOARD_URL!);
}

async function handleNewUser({
  oauthUser,
  providerName,
  inviteId,
  reply,
}: {
  oauthUser: OAuthUser;
  providerName: Provider;
  inviteId: string | undefined | null;
  reply: FastifyReply;
}) {
  const existingUser = await db.user.findFirst({
    where: { email: oauthUser.email },
  });

  if (existingUser) {
    throw new LogError(
      'Please sign in using your original authentication method',
      {
        existingUser,
        oauthUser,
        providerName,
      },
    );
  }

  const user = await db.user.create({
    data: {
      email: oauthUser.email,
      firstName: oauthUser.firstName,
      lastName: oauthUser.lastName,
      accounts: {
        create: {
          provider: providerName,
          providerId: oauthUser.id,
        },
      },
    },
  });

  if (inviteId) {
    try {
      await connectUserToOrganization({ user, inviteId });
    } catch (error) {
      reply.log.error('error connecting user to organization', {
        error,
        inviteId,
        user,
      });
    }
  }

  const sessionToken = generateSessionToken();
  const session = await createSession(sessionToken, user.id);
  setSessionTokenCookie(
    (...args) => reply.setCookie(...args),
    sessionToken,
    session.expiresAt,
  );
  return reply.redirect(process.env.NEXT_PUBLIC_DASHBOARD_URL!);
}

// Provider-specific user fetching
async function fetchGithubUser(accessToken: string): Promise<OAuthUser> {
  const email = await getGithubEmail(accessToken);
  if (!email) {
    throw new LogError('GitHub email not found or not verified');
  }

  const userRequest = new Request('https://api.github.com/user');
  userRequest.headers.set('Authorization', `Bearer ${accessToken}`);
  const userResponse = await fetch(userRequest);

  const userSchema = z.object({
    id: z.number(),
    login: z.string(),
    name: z
      .string()
      .nullish()
      .transform((val) => val || ''),
  });
  const userJson = await userResponse.json();

  const userResult = userSchema.safeParse(userJson);
  if (!userResult.success) {
    throw new LogError('Error fetching Github user', {
      error: userResult.error,
      githubUser: userJson,
    });
  }

  return {
    id: String(userResult.data.id),
    email,
    firstName: userResult.data.name || userResult.data.login || '',
  };
}

async function fetchGoogleUser(tokens: OAuth2Tokens): Promise<OAuthUser> {
  const claims = Arctic.decodeIdToken(tokens.idToken());

  const claimsSchema = z.object({
    sub: z.string(),
    email: z.string(),
    email_verified: z.boolean(),
    given_name: z.string().optional(),
    family_name: z.string().optional(),
  });

  const claimsResult = claimsSchema.safeParse(claims);
  if (!claimsResult.success) {
    throw new LogError('Error fetching Google user', {
      error: claimsResult.error,
      claims,
    });
  }

  if (!claimsResult.data.email_verified) {
    throw new LogError('Email not verified with Google');
  }

  return {
    id: claimsResult.data.sub,
    email: claimsResult.data.email,
    firstName: claimsResult.data.given_name || '',
    lastName: claimsResult.data.family_name || '',
  };
}

interface ValidatedOAuthQuery {
  code: string;
  state: string;
}

async function validateOAuthCallback(
  req: FastifyRequest,
  provider: Provider,
): Promise<ValidatedOAuthQuery> {
  const schema = z.object({
    code: z.string(),
    state: z.string(),
  });

  const query = schema.safeParse(req.query);
  if (!query.success) {
    throw new LogError('Invalid callback query params', {
      error: query.error,
      query: req.query,
      provider,
    });
  }

  const { code, state } = query.data;
  const storedState = req.cookies[`${provider}_oauth_state`] ?? null;
  const codeVerifier =
    provider === 'google' ? (req.cookies.google_code_verifier ?? null) : null;

  if (
    code === null ||
    state === null ||
    storedState === null ||
    (provider === 'google' && codeVerifier === null)
  ) {
    throw new LogError('Missing oauth parameters', {
      code: code === null,
      state: state === null,
      storedState: storedState === null,
      codeVerifier: provider === 'google' ? codeVerifier === null : undefined,
      provider,
    });
  }

  if (state !== storedState) {
    throw new LogError('OAuth state mismatch', {
      state,
      storedState,
      provider,
    });
  }

  return { code, state };
}

// Main callback handlers
export async function githubCallback(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { code } = await validateOAuthCallback(req, 'github');
    const inviteId = req.cookies.inviteId;
    const tokens = await github.validateAuthorizationCode(code);
    const githubUser = await fetchGithubUser(tokens.accessToken());
    const account = await db.account.findFirst({
      where: {
        OR: [
          // To keep
          { provider: 'github', providerId: githubUser.id },
          // During migration
          { provider: 'github', providerId: null, email: githubUser.email },
          { provider: 'oauth', user: { email: githubUser.email } },
        ],
      },
    });

    reply.clearCookie('github_oauth_state');

    if (account) {
      return await handleExistingUser({
        account,
        oauthUser: githubUser,
        providerName: 'github',
        reply,
      });
    }

    return await handleNewUser({
      oauthUser: githubUser,
      providerName: 'github',
      inviteId,
      reply,
    });
  } catch (error) {
    req.log.error(error);
    return redirectWithError(reply, error);
  }
}

export async function googleCallback(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { code } = await validateOAuthCallback(req, 'google');
    const inviteId = req.cookies.inviteId;
    const codeVerifier = req.cookies.google_code_verifier!;
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const googleUser = await fetchGoogleUser(tokens);
    const existingUser = await db.account.findFirst({
      where: {
        OR: [
          // To keep
          { provider: 'google', providerId: googleUser.id },
          // During migration
          { provider: 'google', providerId: null, email: googleUser.email },
          { provider: 'oauth', user: { email: googleUser.email } },
        ],
      },
    });

    reply.clearCookie('google_code_verifier');
    reply.clearCookie('google_oauth_state');

    if (existingUser) {
      return await handleExistingUser({
        account: existingUser,
        oauthUser: googleUser,
        providerName: 'google',
        reply,
      });
    }

    return await handleNewUser({
      oauthUser: googleUser,
      providerName: 'google',
      inviteId,
      reply,
    });
  } catch (error) {
    req.log.error(error);
    return redirectWithError(reply, error);
  }
}

function redirectWithError(reply: FastifyReply, error: LogError | unknown) {
  const url = new URL(process.env.NEXT_PUBLIC_DASHBOARD_URL!);
  url.pathname = '/login';
  if (error instanceof LogError) {
    url.searchParams.set('error', error.message);
  } else {
    url.searchParams.set('error', 'An error occurred');
  }
  url.searchParams.set('correlationId', reply.request.id);
  return reply.redirect(url.toString());
}
