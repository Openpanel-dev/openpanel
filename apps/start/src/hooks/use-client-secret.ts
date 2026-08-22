import { useEffect, useState } from 'react';

export const ONBOARDING_SECRET_KEY = 'onboarding.clientSecret';
const DEFAULT_SECRET = '[CLIENT_SECRET]';

// The secret only exists client-side right after creation (we store a hash).
// Anything derived from it (MCP token, env snippets) must check this first —
// deriving from the placeholder produces valid-looking but broken values.
export const isRealClientSecret = (
  secret: string | null | undefined
): secret is string => !!secret && secret !== DEFAULT_SECRET;

export function useClientSecret() {
  const [clientSecret, setClientSecret] = useState<string>(DEFAULT_SECRET);

  useEffect(() => {
    if (clientSecret && DEFAULT_SECRET !== clientSecret) {
      sessionStorage.setItem(ONBOARDING_SECRET_KEY, clientSecret);
    }
  }, [clientSecret]);

  useEffect(() => {
    const clientSecret = sessionStorage.getItem(ONBOARDING_SECRET_KEY);
    if (clientSecret) {
      setClientSecret(clientSecret);
    }
  }, []);

  return [clientSecret, setClientSecret] as const;
}
