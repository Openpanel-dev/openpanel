import { useEffect, useState } from 'react';

export const ONBOARDING_SECRET_KEY = 'onboarding.clientSecret';
export const ONBOARDING_MCP_TOKEN_KEY = 'onboarding.mcpToken';
const DEFAULT_SECRET = '[CLIENT_SECRET]';

// The secret only exists client-side right after creation (we store a hash).
// Anything derived from it (MCP token, env snippets) must check this first —
// deriving from the placeholder produces valid-looking but broken values.
export const isRealClientSecret = (
  secret: string | null | undefined
): secret is string => !!secret && secret !== DEFAULT_SECRET;

// Storage can throw (blocked cookies/site data, some private modes); a missing
// secret must degrade to the placeholder flow, never crash the page.
const safeRead = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeWrite = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Unavailable — the connect page falls back to its secret-already-shown
    // notice.
  }
};

function useSessionSecret(key: string, fallback: string) {
  const [value, setValue] = useState<string>(fallback);
  // False until storage has been read, so a first-render consumer does not
  // mistake the fallback for "no secret".
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (value && value !== fallback) {
      safeWrite(key, value);
    }
  }, [value, key, fallback]);

  useEffect(() => {
    const stored = safeRead(key);
    if (stored) {
      setValue(stored);
    }
    setReady(true);
  }, [key]);

  return [value, setValue, ready] as const;
}

export function useClientSecret() {
  return useSessionSecret(ONBOARDING_SECRET_KEY, DEFAULT_SECRET);
}

/** The read-only MCP client's token, known only in the session that created the project. */
export function useMcpToken() {
  const [token, setToken, ready] = useSessionSecret(
    ONBOARDING_MCP_TOKEN_KEY,
    ''
  );
  return [token || null, setToken, ready] as const;
}
