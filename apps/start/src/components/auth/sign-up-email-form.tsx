import { useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { zSignUpEmail } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useRouter } from '@tanstack/react-router';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';

const validator = zSignUpEmail;
type IForm = z.infer<typeof validator>;

export function SignUpEmailForm({
  inviteId,
}: { inviteId: string | undefined }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.signUpEmail.mutationOptions({
      async onSuccess() {
        toast.success(t('auth.successfully_signed_up'));
        window.location.href = '/';
      },
      onError(error) {
        toast.error(error.message);
      },
    }),
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
    <form className="col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="row gap-4 w-full flex-1">
        <InputWithLabel
          label={t('auth.first_name')}
          className="flex-1"
          type="text"
          {...form.register('firstName')}
          error={form.formState.errors.firstName?.message}
        />
        <InputWithLabel
          label={t('auth.last_name')}
          className="flex-1"
          type="text"
          {...form.register('lastName')}
          error={form.formState.errors.lastName?.message}
        />
      </div>
      <InputWithLabel
        label={t('auth.email')}
        className="w-full"
        type="email"
        {...form.register('email')}
        error={form.formState.errors.email?.message}
      />
      <div className="row gap-4 w-full">
        <InputWithLabel
          label={t('auth.password')}
          className="flex-1"
          type="password"
          {...form.register('password')}
          error={form.formState.errors.password?.message}
        />
        <InputWithLabel
          label={t('auth.confirm_password')}
          className="flex-1"
          type="password"
          {...form.register('confirmPassword')}
          error={form.formState.errors.confirmPassword?.message}
        />
      </div>
      <Button type="submit" className="w-full" size="lg">
        {t('auth.create_account')}
      </Button>
    </form>
  );
}
