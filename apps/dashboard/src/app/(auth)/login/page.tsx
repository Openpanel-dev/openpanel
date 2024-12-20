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
    <div className="flex h-full center-center w-full">
      <div className="col gap-8 max-w-md w-full">
        <div className="col md:row gap-4">
          <SignInGithub type="sign-in" />
          <SignInGoogle type="sign-in" />
        </div>
        <Or />
        <div className="card p-8">
          <SignInEmailForm />
        </div>
        <LinkButton variant={'outline'} size="lg" href="/onboarding">
          No account? Sign up today
        </LinkButton>
        <p className="text-sm text-muted-foreground leading-tight">
          Having issues logging in?
          <br />
          Contact us at{' '}
          <a
            href="mailto:hello@openpanel.dev"
            className="text-primary underline"
          >
            hello[at]openpanel.dev
          </a>
          . We're not using Clerk (auth provider) anymore.
        </p>
      </div>
    </div>
  );
}
