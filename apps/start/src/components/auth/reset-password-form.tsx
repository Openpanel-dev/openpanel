import { useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { zResetPassword } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from '@tanstack/react-router';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';

const validator = zResetPassword;
type IForm = z.infer<typeof validator>;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? null;
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.resetPassword.mutationOptions({
      onSuccess(res) {
        toast.success('Password reset successfully');
        router.navigate({
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
      <form onSubmit={onSubmit}>
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
