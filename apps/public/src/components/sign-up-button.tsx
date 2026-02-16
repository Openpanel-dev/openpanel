import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';

export function SignUpButton() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    const check = async () => {
      const response = await fetch(
        'https://api.openpanel.dev/trpc/auth.session',
        { credentials: 'include', mode: 'cors' }
      );
      const data = await response.json();
      const session = data?.result?.data?.json?.session;
      setIsSignedIn(session !== null);
    };
    check();
  }, []);

  return (
    <Button asChild>
      <Link
        className="hidden md:flex"
        href={`https://dashboard.openpanel.dev${isSignedIn ? '/' : '/onboarding'}`}
      >
        {isSignedIn ? 'Dashboard' : 'Sign up'}
      </Link>
    </Button>
  );
}
