import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

const SSOCallback = () => {
  return <AuthenticateWithRedirectCallback />;
};

export default SSOCallback;
