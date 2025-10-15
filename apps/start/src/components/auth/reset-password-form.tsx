import { useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { zResetPassword } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';

const validator = zResetPassword;
type IForm = z.infer<typeof validator>;

export function ResetPasswordForm({ token }: { token: string }) {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.resetPassword.mutationOptions({
      onSuccess() {
        toast.success('Password reset successfully');
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
          Reset your password
        </h1>
        <p className="text-muted-foreground">
          Already have an account?{' '}
          <a href="/login" className="underline">
            Sign in
          </a>
        </p>
      </div>
      <form onSubmit={onSubmit} className="col gap-6">
        <InputWithLabel
          label="New password"
          placeholder="New password"
          type="password"
          {...form.register('password')}
        />
        <Button type="submit">Reset password</Button>
      </form>
    </div>
  );
}
