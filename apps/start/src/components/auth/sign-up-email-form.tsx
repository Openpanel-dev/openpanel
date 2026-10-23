import { zodResolver } from '@hookform/resolvers/zod';
import { zSignUpEmail } from '@openpanel/core/modules/auth/auth.constants';
import { useMutation } from '@tanstack/react-query';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';
import { PasswordInput } from './password-input';
import { useTRPC } from '@/integrations/trpc/react';

const validator = zSignUpEmail;
type IForm = z.infer<typeof validator>;

export function SignUpEmailForm({
  inviteId,
}: {
  inviteId: string | undefined;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.signUpEmail.mutationOptions({
      async onSuccess() {
        toast.success('Successfully signed up');
        window.location.href = '/';
      },
      onError(error) {
        toast.error(error.message);
      },
    })
  );
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
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
      <div className="grid gap-4 sm:grid-cols-2">
        <InputWithLabel
          autoComplete="given-name"
          label="First name"
          placeholder="Ada"
          size="xl"
          type="text"
          {...form.register('firstName')}
          error={form.formState.errors.firstName?.message}
        />
        <InputWithLabel
          autoComplete="family-name"
          label="Last name"
          placeholder="Lovelace"
          size="xl"
          type="text"
          {...form.register('lastName')}
          error={form.formState.errors.lastName?.message}
        />
      </div>
      <InputWithLabel
        autoComplete="email"
        inputMode="email"
        label="Email"
        placeholder="you@company.com"
        size="xl"
        type="email"
        {...form.register('email')}
        error={form.formState.errors.email?.message}
      />
      <PasswordInput
        autoComplete="new-password"
        hint="At least 8 characters"
        label="Password"
        placeholder="Pick a strong password"
        size="xl"
        {...form.register('password')}
        error={form.formState.errors.password?.message}
      />
      <Button
        className="mt-1 w-full"
        loading={mutation.isPending}
        size="xl"
        type="submit"
      >
        Create account
      </Button>
    </form>
  );
}
