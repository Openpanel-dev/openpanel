'use client';

import { SignIn } from '@clerk/nextjs';

const PageClient = () => {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <SignIn routing="path" path="/login" signUpUrl="/register" />
    </div>
  );
};

export default PageClient;
