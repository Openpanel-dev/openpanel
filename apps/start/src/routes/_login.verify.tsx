import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { AuthHeading } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { unwrap, useAuthClient } from '@/integrations/auth/client';
import { createTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_login/verify')({
  component: VerifyPage,
  head: () => ({
    meta: [
      { title: createTitle(PAGE_TITLES.LOGIN) },
      { name: 'robots', content: 'noindex, follow' },
    ],
  }),
});

function VerifyPage() {
  const authClient = useAuthClient();
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');

  const mutation = useMutation({
    mutationFn: ({ code: value }: { code: string }) =>
      unwrap(
        mode === 'totp'
          ? authClient.twoFactor.verifyTotp({ code: value })
          : authClient.twoFactor.verifyBackupCode({ code: value.trim() })
      ),
    onSuccess() {
      toast.success('Signed in');
      window.location.href = '/';
    },
    onError(error) {
      toast.error(error.message);
      setCode('');
    },
  });

  const canSubmit =
    mode === 'totp' ? code.length === 6 : code.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }
    mutation.mutate({ code });
  };

  return (
    <form className="col w-full gap-8" onSubmit={handleSubmit}>
      <AuthHeading
        description={
          mode === 'totp'
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Enter one of your recovery codes. Each code can be used only once.'
        }
        title="Two-factor authentication"
      />

      {mode === 'totp' ? (
        <div className="col items-center gap-4">
          <InputOTP
            autoFocus
            disabled={mutation.isPending}
            maxLength={6}
            onChange={(value) => {
              setCode(value);
              if (value.length === 6) {
                mutation.mutate({ code: value });
              }
            }}
            value={code}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
      ) : (
        <Input
          aria-label="Recovery code"
          autoCapitalize="off"
          autoFocus
          disabled={mutation.isPending}
          onChange={(e) => setCode(e.target.value)}
          placeholder="AbCdE-fGhIj"
          size="xl"
          value={code}
        />
      )}

      <Button
        disabled={!canSubmit}
        loading={mutation.isPending}
        size="xl"
        type="submit"
      >
        Verify
      </Button>

      <button
        className="text-center text-muted-foreground text-sm transition-colors hover:text-foreground hover:underline"
        onClick={() => {
          setMode(mode === 'totp' ? 'recovery' : 'totp');
          setCode('');
        }}
        type="button"
      >
        {mode === 'totp'
          ? 'Use a recovery code instead'
          : 'Use authenticator app instead'}
      </button>
      <a
        className="text-center text-muted-foreground text-sm hover:text-foreground hover:underline"
        href="/login"
      >
        Sign in with a different account
      </a>
    </form>
  );
}
