import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';

export function SignUpButton() {
  const t = useTranslations('nav');
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch(
          'https://api.openpanel.dev/trpc/auth.session',
          { credentials: 'include', mode: 'cors' },
        );
        const data = await response.json();
        const session = data?.result?.data?.json?.session;
        setIsSignedIn(session !== null);
      } catch {
        setIsSignedIn(false);
      }
    };
    check();
  }, []);

  return (
    <Button asChild>
      <Link
        className="hidden md:flex"
        href={`https://dashboard.openpanel.dev${isSignedIn ? '/' : '/onboarding'}`}
      >
        {isSignedIn ? t('dashboard') : t('sign_up')}
      </Link>
    </Button>
  );
}
