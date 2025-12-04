import { Or } from '@/components/auth/or';
import { SignInEmailForm } from '@/components/auth/sign-in-email-form';
import { SignInGithub } from '@/components/auth/sign-in-github';
import { SignInGoogle } from '@/components/auth/sign-in-google';
import { LogoSquare } from '@/components/logo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PAGE_TITLES, createTitle } from '@/utils/title';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { AlertCircle } from 'lucide-react';
import { z } from 'zod';

export const Route = createFileRoute('/_login/login')({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: createTitle(PAGE_TITLES.LOGIN) },
      { name: 'robots', content: 'noindex, follow' },
    ],
  }),
  validateSearch: z.object({
    error: z.string().optional(),
    correlationId: z.string().optional(),
  }),
});

function LoginPage() {
  const { error, correlationId } = Route.useSearch();

  return (
    <div className="col gap-8 w-full text-left">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Sign in</h1>
        <p className="text-muted-foreground">
          Don't have an account?{' '}
          <a
            href="/onboarding"
            className="underline font-medium text-foreground"
          >
            Create one today
          </a>
        </p>
      </div>
      {error && (
        <Alert
          variant="destructive"
          className="text-left bg-destructive/10 border-destructive/20 mb-6"
        >
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

      <div className="space-y-4">
        <SignInGoogle type="sign-in" />
        <SignInGithub type="sign-in" />
      </div>
      <Or />
      <SignInEmailForm />
    </div>
  );
}
