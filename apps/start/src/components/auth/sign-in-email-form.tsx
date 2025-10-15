import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { zodResolver } from '@hookform/resolvers/zod';
import { zSignInEmail } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';

const validator = zSignInEmail;
type IForm = z.infer<typeof validator>;

export function SignInEmailForm() {
  const navigate = useNavigate();
  const router = useRouter();
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.signInEmail.mutationOptions({
      onSuccess() {
        toast.success('Successfully signed in');
        router.invalidate();
        navigate({
          to: '/',
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
      email: 'lindesvard+22@gmail.com',
      password: 'demodemo',
    },
  });
  const onSubmit: SubmitHandler<IForm> = (values) => {
    mutation.mutate({
      ...values,
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="col gap-4">
      <InputWithLabel
        {...form.register('email')}
        error={form.formState.errors.email?.message}
        label="Email"
        className="bg-def-100/50 border-def-300 focus:border-highlight focus:ring-highlight/20"
      />
      <InputWithLabel
        {...form.register('password')}
        error={form.formState.errors.password?.message}
        label="Password"
        type="password"
        className="bg-def-100/50 border-def-300 focus:border-highlight focus:ring-highlight/20"
      />
      <Button type="submit" size="lg">
        Sign in
      </Button>
      <button
        type="button"
        onClick={() =>
          pushModal('RequestPasswordReset', {
            email: form.getValues('email'),
          })
        }
        className="text-sm text-muted-foreground hover:text-highlight hover:underline transition-colors duration-200 text-center mt-2"
      >
        Forgot password?
      </button>
    </form>
  );
}
