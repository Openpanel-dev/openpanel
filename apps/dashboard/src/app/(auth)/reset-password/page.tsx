import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { auth } from '@openpanel/auth/nextjs';
import { redirect } from 'next/navigation';

export default async function Page() {
  const session = await auth();

  if (session.userId) {
    return redirect('/');
  }

  return (
    <div className="flex h-full center-center">
      <ResetPasswordForm />
    </div>
  );
}
