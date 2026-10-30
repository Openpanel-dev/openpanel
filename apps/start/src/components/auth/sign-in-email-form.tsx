import { zodResolver } from '@hookform/resolvers/zod';
import {
  INVITE_HEADER,
  zSignInEmail,
} from '@openpanel/core/modules/auth/auth.constants';
import { useMutation } from '@tanstack/react-query';
import {
  type SubmitErrorHandler,
  type SubmitHandler,
  useForm,
} from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';
import { LastUsedBadge } from './last-used-badge';
import { PasswordInput } from './password-input';
import { unwrap, useAuthClient } from '@/integrations/auth/client';
import { toastAuthError } from '@/integrations/auth/toast-auth-error';
import { pushModal } from '@/modals';
import { failureReason, trackFunnel } from '@/utils/funnel-tracking';

const validator = zSignInEmail;
type IForm = z.infer<typeof validator>;

export function SignInEmailForm({
  isLastUsed,
  inviteId,
}: {
  isLastUsed?: boolean;
  inviteId?: string;
}) {
  const authClient = useAuthClient();
  const mutation = useMutation({
    mutationFn: (values: IForm) =>
      unwrap(
        authClient.signIn.email(values, {
          headers: inviteId ? { [INVITE_HEADER]: inviteId } : undefined,
        })
      ),
    onSuccess(data) {
      const totpRequired = 'twoFactorRedirect' in data;
      trackFunnel('auth_signin_succeeded', { provider: 'email', totpRequired });
      if (totpRequired) {
        window.location.href = '/verify';
        return;
      }
      toast.success('Successfully signed in');
      window.location.href = '/';
    },
    onError(error) {
      trackFunnel('auth_signin_failed', {
        provider: 'email',
        reason: failureReason(error),
      });
      toastAuthError(error, form.getValues('email'));
    },
  });
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      email: '',
      password: '',
    },
  });
  const onSubmit: SubmitHandler<IForm> = (values) => {
    trackFunnel('auth_provider_clicked', {
      page: 'login',
      provider: 'email',
      isLastUsed: Boolean(isLastUsed),
    });
    mutation.mutate(values);
  };
  const onInvalid: SubmitErrorHandler<IForm> = (errors) => {
    trackFunnel('auth_form_invalid', {
      page: 'login',
      fields: Object.keys(errors),
    });
  };

  return (
    <form
      className="col gap-5"
      method="post"
      onSubmit={form.handleSubmit(onSubmit, onInvalid)}
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
            onClick={() => {
              trackFunnel('auth_forgot_password_clicked');
              pushModal('RequestPasswordReset', {
                email: form.getValues('email'),
              });
            }}
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
