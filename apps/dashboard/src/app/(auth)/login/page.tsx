import { Or } from '@/components/auth/or';
import { SignInEmailForm } from '@/components/auth/sign-in-email-form';
import { SignInGithub } from '@/components/auth/sign-in-github';
import { SignInGoogle } from '@/components/auth/sign-in-google';
import { LinkButton } from '@/components/ui/button';
import { auth } from '@openpanel/auth/nextjs';
import { redirect } from 'next/navigation';

export default async function Page() {
  const session = await auth();

  if (session.userId) {
    return redirect('/');
  }

  return (
    <div className="flex h-full center-center">
      <div className="col gap-8">
        <div className="row gap-4">
          <div>
            <SignInGithub type="sign-in" />
          </div>
          <div>
            <SignInGoogle type="sign-in" />
          </div>
        </div>
        <Or />
        <div className="card p-8">
          <SignInEmailForm />
        </div>
        <LinkButton variant={'outline'} size="lg" href="/onboarding">
          No account? Sign up today
        </LinkButton>
      </div>
    </div>
  );
}
