import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getClerkError } from '@/utils/clerk-error';
import { useSignIn } from '@clerk/nextjs';
import { zodResolver } from '@hookform/resolvers/zod';
import { captureMessage } from '@sentry/nextjs';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const validator = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type IForm = z.infer<typeof validator>;

const EmailSignUp = () => {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();

  const form = useForm<IForm>({
    resolver: zodResolver(validator),
  });

  useEffect(() => {
    if (form.formState.errors.email?.message) {
      toast.error(`Email: ${form.formState.errors.email?.message}`);
    }
  }, [form.formState.errors.email?.message]);

  useEffect(() => {
    if (form.formState.errors.password?.message) {
      toast.error(`Password: ${form.formState.errors.password?.message}`);
    }
  }, [form.formState.errors.password?.message]);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={form.handleSubmit(async (values) => {
        if (!isLoaded) {
          return toast.error('Sign in is not ready yet, please try again.');
        }

        try {
          const result = await signIn.create({
            identifier: values.email,
            password: values.password,
          });

          if (result.status === 'complete') {
            await setActive({ session: result.createdSessionId });
            router.push('/');
          } else {
            captureMessage('Sign in failed', {
              extra: {
                status: result.status,
              },
            });
          }
        } catch (e) {
          const error = getClerkError(e);
          if (error?.message) {
            toast.error(error.message);
          }
        }
      })}
    >
      <Input
        type="email"
        placeholder="Email"
        {...form.register('email')}
        error={form.formState.errors.email?.message}
      />
      <Input
        type="password"
        placeholder="Password"
        {...form.register('password')}
        error={form.formState.errors.password?.message}
      />
      <Button type="submit">Sign in</Button>
    </form>
  );
};

export default EmailSignUp;
