import {
  inferAdditionalFields,
  twoFactorClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { useMemo } from 'react';
import { useAppContext } from '@/hooks/use-app-context';

const AUTH_PATH = '/api/auth';

function createDashboardAuthClient(apiUrl: string) {
  return createAuthClient({
    baseURL: `${apiUrl}${AUTH_PATH}`,
    fetchOptions: { credentials: 'include' },
    plugins: [
      twoFactorClient(),
      inferAdditionalFields({
        user: {
          firstName: { type: 'string', required: false },
          lastName: { type: 'string', required: false },
        },
      }),
    ],
  });
}

export type AuthClient = ReturnType<typeof createDashboardAuthClient>;

export function useAuthClient(): AuthClient {
  const { apiUrl } = useAppContext();
  return useMemo(() => createDashboardAuthClient(apiUrl), [apiUrl]);
}

interface AuthResult<T> {
  data: T | null;
  error: { message?: string; code?: string } | null;
}

export class AuthError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code: string | undefined) {
    super(message);
    this.code = code;
  }
}

/** better-auth answers `{ data, error }`; react-query wants a throw. */
export async function unwrap<T>(request: Promise<AuthResult<T>>): Promise<T> {
  const { data, error } = await request;
  if (error) {
    throw new AuthError(
      error.message || error.code || 'Something went wrong',
      error.code
    );
  }
  if (data === null) {
    throw new Error('Something went wrong');
  }
  return data;
}
