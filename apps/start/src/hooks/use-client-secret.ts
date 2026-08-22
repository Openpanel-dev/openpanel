import { useEffect, useState } from 'react';

export const ONBOARDING_SECRET_KEY = 'onboarding.clientSecret';
const DEFAULT_SECRET = '[CLIENT_SECRET]';

// The secret only exists client-side right after creation (we store a hash).
// Anything derived from it (MCP token, env snippets) must check this first —
// deriving from the placeholder produces valid-looking but broken values.
export const isRealClientSecret = (
  secret: string | null | undefined
): secret is string => !!secret && secret !== DEFAULT_SECRET;

// Storage can throw (blocked cookies/site data, some private modes); a missing
// secret must degrade to the placeholder flow, never crash the page.
const safeRead = () => {
  try {
    return sessionStorage.getItem(ONBOARDING_SECRET_KEY);
  } catch {
    return null;
  }
};

const safeWrite = (value: string) => {
  try {
    sessionStorage.setItem(ONBOARDING_SECRET_KEY, value);
  } catch {
    // Unavailable — the connect page falls back to its secret-already-shown
    // notice.
  }
};

export function useClientSecret() {
  const [clientSecret, setClientSecret] = useState<string>(DEFAULT_SECRET);

  useEffect(() => {
    if (clientSecret && DEFAULT_SECRET !== clientSecret) {
      safeWrite(clientSecret);
    }
  }, [clientSecret]);

  useEffect(() => {
    const stored = safeRead();
    if (stored) {
      setClientSecret(stored);
    }
  }, []);

  return [clientSecret, setClientSecret] as const;
}
