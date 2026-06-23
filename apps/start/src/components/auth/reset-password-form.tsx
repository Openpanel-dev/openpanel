import { useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { zResetPassword } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';

const validator = zResetPassword;
type IForm = z.infer<typeof validator>;

export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.resetPassword.mutationOptions({
      onSuccess() {
        toast.success(t('auth.password_reset_successfully'));
        navigate({
          to: '/login',
        });
      },
      onError(error) {
        toast.error(error.message);
      },
    }),
  );

  const form = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      token: token ?? '',
      password: '',
    },
  });

  const onSubmit = form.handleSubmit(async (data) => {
    mutation.mutate(data);
  });

  return (
    <div className="col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {t('auth.reset_your_password')}
        </h1>
        <p className="text-muted-foreground">
          {t('auth.already_have_account')}{' '}
          <a href="/login" className="underline">
            {t('auth.sign_in')}
          </a>
        </p>
      </div>
      <form onSubmit={onSubmit} className="col gap-6">
        <InputWithLabel
          label={t('auth.new_password')}
          placeholder={t('auth.new_password')}
          type="password"
          {...form.register('password')}
        />
        <Button type="submit">{t('auth.reset_password')}</Button>
      </form>
    </div>
  );
}
