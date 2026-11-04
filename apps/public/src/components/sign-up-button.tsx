import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';

export function SignUpButton() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch(
          'https://api.openpanel.dev/trpc/auth.session',
          { credentials: 'include', mode: 'cors' }
        );
        const data = await response.json();
        const session = data?.result?.data?.json?.session;
        setIsSignedIn(session !== null);
      } catch {
        // Not signed in, or the api is unreachable from this origin
      }
    };
    check();
  }, []);

  return (
    <Button asChild className="max-md:hidden" variant="outline">
      <Link
        href={`https://dashboard.openpanel.dev${isSignedIn ? '/' : '/onboarding'}`}
      >
        {isSignedIn ? 'Dashboard' : 'Sign up'}
      </Link>
    </Button>
  );
}
