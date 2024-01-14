import { db } from '@/server/db';
import { verifyPassword } from '@/server/services/hash.service';
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from 'next';
import { getServerSession } from 'next-auth';
import type { DefaultSession, NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { createError } from './exceptions';

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: DefaultSession['user'] & {
      id: string;
    };
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  callbacks: {
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub,
      },
    }),
  },
  session: {
    strategy: 'jwt',
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text', placeholder: 'jsmith' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.password || !credentials?.email) {
          return null;
        }

        const user = await db.user.findFirst({
          where: { email: credentials?.email },
        });

        if (!user) {
          return null;
        }

        if (!(await verifyPassword(credentials.password, user.password))) {
          return null;
        }

        return {
          ...user,
          image: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Abby',
        };
      },
    }),
    /**
     * ...add more providers here.
     *
     * Most other providers require a bit more work than the Discord provider. For example, the
     * GitHub provider requires you to add the `refresh_token_expires_in` field to the Account
     * model. Refer to the NextAuth.js docs for the provider you want to use. Example:
     *
     * @see https://next-auth.js.org/providers/github
     */
  ],
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = (ctx: {
  req: GetServerSidePropsContext['req'];
  res: GetServerSidePropsContext['res'];
}) => {
  return getServerSession(ctx.req, ctx.res, authOptions);
};

export async function validateSdkRequest(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string> {
  const clientId = req?.headers['mixan-client-id'] as string | undefined;
  const clientSecret = req.headers['mixan-client-secret'] as string | undefined;

  if (!clientId) {
    throw createError(401, 'Misisng client id');
  }

  const client = await db.client.findUnique({
    where: {
      id: clientId,
    },
  });

  if (!client) {
    throw createError(401, 'Invalid client id');
  }

  if (client.secret) {
    if (!(await verifyPassword(clientSecret || '', client.secret))) {
      throw createError(401, 'Invalid client secret');
    }
  } else if (client.cors !== '*') {
    const ok = client.cors.split(',').find((origin) => {
      if (origin === req.headers.origin) {
        return true;
      }
    });
    if (ok) {
      res.setHeader('Access-Control-Allow-Origin', String(req.headers.origin));
    } else {
      throw createError(401, 'Invalid cors settings');
    }
  }

  return client.project_id;
}
