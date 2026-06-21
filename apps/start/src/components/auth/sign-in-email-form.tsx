import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { zodResolver } from '@hookform/resolvers/zod';
import { zSignInEmail } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';

const validator = zSignInEmail;
type IForm = z.infer<typeof validator>;

export function SignInEmailForm({
  isLastUsed,
  inviteId,
}: { isLastUsed?: boolean; inviteId?: string }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.sign_inEmail.mutationOptions({
      async onSuccess(data) {
        if (data.type === 'totp_required') {
          window.location.href = '/verify';
          return;
        }
        toast.success(t('auth.successfully_signed_in'));
        window.location.href = '/';
      },
      onError(error) {
        toast.error(error.message);
      },
    }),
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
    <form onSubmit={form.handleSubmit(onSubmit)} className="col gap-4">
      <InputWithLabel
        {...form.register('email')}
        error={form.formState.errors.email?.message}
        label={t('auth.email')}
        className="bg-def-100/50 border-def-300 focus:border-highlight focus:ring-highlight/20"
      />
      <InputWithLabel
        {...form.register('password')}
        error={form.formState.errors.password?.message}
        label={t('auth.password')}
        type="password"
        className="bg-def-100/50 border-def-300 focus:border-highlight focus:ring-highlight/20"
      />
      <div className="relative">
        <Button type="submit" size="lg" className="w-full">
          {t('auth.sign_in')}
        </Button>
        {isLastUsed && (
          <span className="absolute -top-2 right-3 text-[10px] font-medium bg-highlight text-white px-1.5 py-0.5 rounded-full leading-none">
            {t('auth.used_last_time')}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() =>
          pushModal('RequestPasswordReset', {
            email: form.getValues('email'),
          })
        }
        className="text-sm text-muted-foreground hover:text-highlight hover:underline transition-colors duration-200 text-center mt-2"
      >
        {t('auth.forgot_password')}
      </button>
    </form>
  );
}
