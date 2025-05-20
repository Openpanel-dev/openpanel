'use client';
import { pushModal } from '@/modals';
import { api } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { zSignInEmail } from '@openpanel/validation';
import { useRouter } from 'next/navigation';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';

const validator = zSignInEmail;
type IForm = z.infer<typeof validator>;

export function SignInEmailForm() {
  const router = useRouter();
  const mutation = api.auth.signInEmail.useMutation({
    onSuccess(res) {
      toast.success('Successfully signed in');
      router.push('/');
    },
    onError(error) {
      toast.error(error.message);
    },
  });
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
  });
  const onSubmit: SubmitHandler<IForm> = (values) => {
    mutation.mutate({
      ...values,
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="col gap-6">
      <h3 className="text-2xl font-medium text-left">Sign in with email</h3>
      <InputWithLabel
        {...form.register('email')}
        error={form.formState.errors.email?.message}
        label="Email"
      />
      <InputWithLabel
        {...form.register('password')}
        error={form.formState.errors.password?.message}
        label="Password"
        type="password"
      />
      <Button type="submit">Sign in</Button>
      <button
        type="button"
        onClick={() =>
          pushModal('RequestPasswordReset', {
            email: form.getValues('email'),
          })
        }
        className="text-sm text-muted-foreground hover:underline"
      >
        Forgot password?
      </button>
    </form>
  );
}
