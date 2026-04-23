import { useTRPC } from '@/integrations/trpc/react';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createTitle, PAGE_TITLES } from '@/utils/title';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';

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
  const trpc = useTRPC();
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');

  const mutation = useMutation(
    trpc.auth.signInTotp.mutationOptions({
      onSuccess() {
        toast.success('Signed in');
        window.location.href = '/';
      },
      onError(error) {
        toast.error(error.message);
        setCode('');
      },
    }),
  );

  const canSubmit =
    mode === 'totp' ? code.length === 6 : code.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate({ code });
  };

  return (
    <form onSubmit={handleSubmit} className="col w-full gap-8 text-left">
      <div>
        <h1 className="mb-2 font-bold text-3xl text-foreground">
          Two-factor authentication
        </h1>
        <p className="text-muted-foreground">
          {mode === 'totp'
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Enter one of your recovery codes. Each code can be used only once.'}
        </p>
      </div>

      {mode === 'totp' ? (
        <div className="col items-center gap-4">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (value.length === 6) {
                mutation.mutate({ code: value });
              }
            }}
            disabled={mutation.isPending}
            autoFocus
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
          placeholder="ABCDE-FGHIJ"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoCapitalize="characters"
          disabled={mutation.isPending}
        />
      )}

      <Button
        type="submit"
        size="lg"
        disabled={!canSubmit}
        loading={mutation.isPending}
      >
        Verify
      </Button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'totp' ? 'recovery' : 'totp');
          setCode('');
        }}
        className="text-sm text-muted-foreground hover:text-highlight hover:underline transition-colors duration-200 text-center"
      >
        {mode === 'totp'
          ? 'Use a recovery code instead'
          : 'Use authenticator app instead'}
      </button>
      <a
        href="/login"
        className="text-xs text-muted-foreground hover:underline text-center"
      >
        Sign in with a different account
      </a>
    </form>
  );
}
