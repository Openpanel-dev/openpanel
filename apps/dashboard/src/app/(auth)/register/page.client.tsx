'use client';

import { SignUp } from '@clerk/nextjs';

const PageClient = () => {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <SignUp routing="path" path="/register" signInUrl="/login" />
    </div>
  );
};

export default PageClient;
