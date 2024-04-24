import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export const dynamic = 'force-dynamic';

const SSOCallback = () => {
  return (
    <AuthenticateWithRedirectCallback
      signInUrl="/login"
      signUpUrl="/register"
    />
  );
};

export default SSOCallback;
