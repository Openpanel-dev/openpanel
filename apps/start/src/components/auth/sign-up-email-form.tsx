import { zodResolver } from '@hookform/resolvers/zod';
import { zSignUpEmail } from '@openpanel/core/modules/auth/auth.constants';
import { useMutation } from '@tanstack/react-query';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';
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
      className="col gap-4"
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <div className="row w-full flex-1 gap-4">
        <InputWithLabel
          className="flex-1"
          label="First name"
          type="text"
          {...form.register('firstName')}
          error={form.formState.errors.firstName?.message}
        />
        <InputWithLabel
          className="flex-1"
          label="Last name"
          type="text"
          {...form.register('lastName')}
          error={form.formState.errors.lastName?.message}
        />
      </div>
      <InputWithLabel
        className="w-full"
        label="Email"
        type="email"
        {...form.register('email')}
        error={form.formState.errors.email?.message}
      />
      <div className="row w-full gap-4">
        <InputWithLabel
          className="flex-1"
          label="Password"
          type="password"
          {...form.register('password')}
          error={form.formState.errors.password?.message}
        />
        <InputWithLabel
          className="flex-1"
          label="Confirm password"
          type="password"
          {...form.register('confirmPassword')}
          error={form.formState.errors.confirmPassword?.message}
        />
      </div>
      <Button className="w-full" size="lg" type="submit">
        Create account
      </Button>
    </form>
  );
}
