import { zodResolver } from '@hookform/resolvers/zod';
import { zSignInEmail } from '@openpanel/core/modules/auth/auth.constants';
import { useMutation } from '@tanstack/react-query';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';
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
    <form className="col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <InputWithLabel
        {...form.register('email')}
        className="border-def-300 bg-def-100/50 focus:border-highlight focus:ring-highlight/20"
        error={form.formState.errors.email?.message}
        label="Email"
      />
      <InputWithLabel
        {...form.register('password')}
        className="border-def-300 bg-def-100/50 focus:border-highlight focus:ring-highlight/20"
        error={form.formState.errors.password?.message}
        label="Password"
        type="password"
      />
      <div className="relative">
        <Button className="w-full" size="lg" type="submit">
          Sign in
        </Button>
        {isLastUsed && (
          <span className="absolute -top-2 right-3 rounded-full bg-highlight px-1.5 py-0.5 font-medium text-[10px] text-white leading-none">
            Used last time
          </span>
        )}
      </div>
      <button
        className="mt-2 text-center text-muted-foreground text-sm transition-colors duration-200 hover:text-highlight hover:underline"
        onClick={() =>
          pushModal('RequestPasswordReset', {
            email: form.getValues('email'),
          })
        }
        type="button"
      >
        Forgot password?
      </button>
    </form>
  );
}
