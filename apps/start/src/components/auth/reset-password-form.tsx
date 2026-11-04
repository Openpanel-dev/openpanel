import { zodResolver } from '@hookform/resolvers/zod';
import { zResetPassword } from '@openpanel/core/modules/auth/auth.constants';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '../ui/button';
import { AuthHeading } from './auth-shell';
import { PasswordInput } from './password-input';
import { unwrap, useAuthClient } from '@/integrations/auth/client';

const validator = zResetPassword;
type IForm = z.infer<typeof validator>;

export function ResetPasswordForm({ token }: { token: string }) {
  const navigate = useNavigate();
  const authClient = useAuthClient();
  const mutation = useMutation({
    mutationFn: ({ token, password }: IForm) =>
      unwrap(authClient.resetPassword({ token, newPassword: password })),
    onSuccess() {
      toast.success('Password reset successfully');
      navigate({
        to: '/login',
      });
    },
    onError(error) {
      toast.error(error.message);
    },
  });

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
      <AuthHeading
        description="Choose a new password for your account."
        title="Reset your password"
      />
      <form className="col gap-5" method="post" onSubmit={onSubmit}>
        <PasswordInput
          autoComplete="new-password"
          error={form.formState.errors.password?.message}
          hint="At least 8 characters"
          label="New password"
          placeholder="New password"
          size="xl"
          {...form.register('password')}
        />
        <Button loading={mutation.isPending} size="xl" type="submit">
          Reset password
        </Button>
      </form>
      <p className="text-center text-muted-foreground text-sm">
        Remembered it after all?{' '}
        <a className="font-medium text-foreground underline" href="/login">
          Sign in
        </a>
      </p>
    </div>
  );
}
