import { unstable_cache } from 'next/cache';
import { cookies } from 'next/headers';
import { validateSessionToken } from './session';

export const auth = async () => {
  const token = (await cookies().get('session')?.value) ?? null;
  return cachedAuth(token);
};

export const cachedAuth = unstable_cache(validateSessionToken);
