'use client';

import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { api } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { zResetPassword } from '@openpanel/validation';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

const validator = zResetPassword;
type IForm = z.infer<typeof validator>;

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? null;
  const router = useRouter();
  const mutation = api.auth.resetPassword.useMutation({
    onSuccess() {
      toast.success('Password reset successfully', {
        description: 'You can now login with your new password',
      });
      router.push('/login');
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
