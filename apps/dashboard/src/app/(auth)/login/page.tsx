import { Or } from '@/components/auth/or';
import { SignInEmailForm } from '@/components/auth/sign-in-email-form';
import { SignInGithub } from '@/components/auth/sign-in-github';
import { SignInGoogle } from '@/components/auth/sign-in-google';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LinkButton } from '@/components/ui/button';
import { auth } from '@openpanel/auth/nextjs';
import { AlertCircle } from 'lucide-react';
import { redirect } from 'next/navigation';

export default async function Page({
  searchParams,
}: {
  searchParams: { error?: string; correlationId?: string };
}) {
  const session = await auth();
  const error = searchParams.error;
  const correlationId = searchParams.correlationId;

  if (session.userId) {
    return redirect('/');
  }

  return (
    <div className="flex h-full center-center w-full">
      <div className="col gap-8 max-w-md w-full">
        {error && (
          <Alert variant="destructive" className="text-left bg-background">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              {correlationId && (
                <>
                  <p>Correlation ID: {correlationId}</p>
                  <p className="mt-2">
                    Contact us if you have any issues.{' '}
                    <a
                      className="underline font-medium"
                      href={`mailto:hello@openpanel.dev?subject=Login%20Issue%20-%20Correlation%20ID%3A%20${correlationId}`}
                    >
                      hello[at]openpanel.dev
                    </a>
                  </p>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
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
      </div>
    </div>
  );
}
