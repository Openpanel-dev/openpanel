import { SignUp } from '@clerk/nextjs';

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <SignUp signInUrl="/login" />
    </div>
  );
}
