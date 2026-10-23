import { zodResolver } from '@hookform/resolvers/zod';
import { zSignInEmail } from '@openpanel/core/modules/auth/auth.constants';
import { useMutation } from '@tanstack/react-query';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';
import { LastUsedBadge } from './last-used-badge';
import { PasswordInput } from './password-input';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';

const validator = zSignInEmail;
type IForm = z.infer<typeof validator>;

export function SignInEmailForm({
  isLastUsed,
  inviteId,
}: {
  isLastUsed?: boolean;
  inviteId?: string;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.signInEmail.mutationOptions({
      async onSuccess(data) {
        if (data.type === 'totp_required') {
          window.location.href = '/verify';
          return;
        }
        toast.success('Successfully signed in');
        window.location.href = '/';
      },
      onError(error) {
        toast.error(error.message);
      },
    })
  );
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      email: '',
      password: '',
    },
  });
  const onSubmit: SubmitHandler<IForm> = (values) => {
    mutation.mutate({
      ...values,
      inviteId,
    });
  };

  return (
    <form
      className="col gap-5"
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <InputWithLabel
        {...form.register('email')}
        autoComplete="email"
        error={form.formState.errors.email?.message}
        inputMode="email"
        label="Email"
        placeholder="you@company.com"
        size="xl"
        type="email"
      />
      <PasswordInput
        {...form.register('password')}
        action={
          <button
            className="text-muted-foreground text-sm transition-colors hover:text-foreground hover:underline"
            onClick={() =>
              pushModal('RequestPasswordReset', {
                email: form.getValues('email'),
              })
            }
            type="button"
          >
            Forgot password?
          </button>
        }
        error={form.formState.errors.password?.message}
        label="Password"
        placeholder="Your password"
        size="xl"
      />
      <div className="relative mt-1">
        <Button
          className="w-full"
          loading={mutation.isPending}
          size="xl"
          type="submit"
        >
          Sign in
        </Button>
        {isLastUsed && <LastUsedBadge />}
      </div>
    </form>
  );
}
