import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export const dynamic = 'force-dynamic';

const SSOCallback = () => {
  return <AuthenticateWithRedirectCallback />;
};

export default SSOCallback;
