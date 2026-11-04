import { zodResolver } from '@hookform/resolvers/zod';
import {
  INVITE_HEADER,
  zSignUpEmail,
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
import { PasswordInput } from './password-input';
import { unwrap, useAuthClient } from '@/integrations/auth/client';
import { failureReason, trackFunnel } from '@/utils/funnel-tracking';

const validator = zSignUpEmail;
type IForm = z.infer<typeof validator>;

export function SignUpEmailForm({
  inviteId,
}: {
  inviteId: string | undefined;
}) {
  const authClient = useAuthClient();
  const mutation = useMutation({
    mutationFn: ({ firstName, lastName, email, password }: IForm) =>
      unwrap(
        authClient.signUp.email(
          {
            email,
            password,
            name: `${firstName} ${lastName}`,
            firstName,
            lastName,
          },
          { headers: inviteId ? { [INVITE_HEADER]: inviteId } : undefined }
        )
      ),
    onSuccess() {
      trackFunnel('auth_signup_succeeded', {
        provider: 'email',
        hasInvite: Boolean(inviteId),
      });
      toast.success('Successfully signed up');
      window.location.href = '/';
    },
    onError(error) {
      trackFunnel('auth_signup_failed', {
        provider: 'email',
        reason: failureReason(error),
      });
      toast.error(error.message);
    },
  });
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
  });
  const onSubmit: SubmitHandler<IForm> = (values) => {
    trackFunnel('auth_provider_clicked', { page: 'signup', provider: 'email' });
    mutation.mutate(values);
  };
  const onInvalid: SubmitErrorHandler<IForm> = (errors) => {
    trackFunnel('auth_form_invalid', {
      page: 'signup',
      fields: Object.keys(errors),
    });
  };
  return (
    <form
      className="col gap-5"
      method="post"
      onSubmit={form.handleSubmit(onSubmit, onInvalid)}
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
