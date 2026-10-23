import { useEffect, useState } from 'react';

const SECRET_KEY = 'onboarding.clientSecret';
const MCP_TOKEN_KEY = 'onboarding.mcpToken';
const DEFAULT_SECRET = '[CLIENT_SECRET]';

// Keyed per project: opening another project's install step must never show
// it the credentials of the one created before.
const secretKey = (projectId: string) => `${SECRET_KEY}:${projectId}`;
const mcpTokenKey = (projectId: string) => `${MCP_TOKEN_KEY}:${projectId}`;

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

/** Drops every stored onboarding credential, e.g. when the account signs out. */
export function forgetOnboardingKeys() {
  try {
    const stale = Object.keys(sessionStorage).filter(
      (key) => key.startsWith(SECRET_KEY) || key.startsWith(MCP_TOKEN_KEY)
    );
    for (const key of stale) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable: nothing was stored either.
  }
}

const safeWrite = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Unavailable — the connect page falls back to its secret-already-shown
    // notice.
  }
};

/** Keeps a project's one-time credentials for the rest of the browser session. */
export function rememberOnboardingKeys(
  projectId: string,
  keys: { clientSecret?: string | null; mcpToken?: string | null }
) {
  if (keys.clientSecret) {
    safeWrite(secretKey(projectId), keys.clientSecret);
  }
  if (keys.mcpToken) {
    safeWrite(mcpTokenKey(projectId), keys.mcpToken);
  }
}

function useSessionSecret(key: string, fallback: string) {
  const [value, setValue] = useState<string>(fallback);
  // False until storage has been read, so a first-render consumer does not
  // mistake the fallback for "no secret".
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(safeRead(key) ?? fallback);
    setReady(true);
  }, [key, fallback]);

  return [value, ready] as const;
}

export function useClientSecret(projectId: string) {
  return useSessionSecret(secretKey(projectId), DEFAULT_SECRET);
}

/** The read-only MCP client's token, known only in the session that created the project. */
export function useMcpToken(projectId: string) {
  const [token, ready] = useSessionSecret(mcpTokenKey(projectId), '');
  return [token || null, ready] as const;
}
