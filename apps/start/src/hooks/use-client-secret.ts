import { useEffect, useState } from 'react';

export const ONBOARDING_SECRET_KEY = 'onboarding.clientSecret';
const DEFAULT_SECRET = '[CLIENT_SECRET]';

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
