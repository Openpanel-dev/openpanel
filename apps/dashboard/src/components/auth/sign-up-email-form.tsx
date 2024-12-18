'use client';

import { api } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { zSignUpEmail } from '@openpanel/validation';
import { useRouter, useSearchParams } from 'next/navigation';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '../forms/input-with-label';
import { Button } from '../ui/button';

const validator = zSignUpEmail;
type IForm = z.infer<typeof validator>;

export function SignUpEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mutation = api.auth.signUpEmail.useMutation({
    onSuccess(res) {
      toast.success('Successfully signed up');
      router.push('/');
    },
  });
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
  });
  const onSubmit: SubmitHandler<IForm> = (values) => {
    mutation.mutate({
      ...values,
      inviteId: searchParams.get('inviteId'),
    });
  };
  return (
    <form className="col gap-8" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="row gap-8 w-full flex-1">
        <InputWithLabel
          label="First name"
          className="flex-1"
          type="text"
          {...form.register('firstName')}
          error={form.formState.errors.firstName?.message}
        />
        <InputWithLabel
          label="Last name"
          className="flex-1"
          type="text"
          {...form.register('lastName')}
          error={form.formState.errors.lastName?.message}
        />
      </div>
      <InputWithLabel
        label="Email"
        className="w-full"
        type="email"
        {...form.register('email')}
        error={form.formState.errors.email?.message}
      />
      <div className="row gap-8 w-full">
        <InputWithLabel
          label="Password"
          className="flex-1"
          type="password"
          {...form.register('password')}
          error={form.formState.errors.password?.message}
        />
        <InputWithLabel
          label="Confirm password"
          className="flex-1"
          type="password"
          {...form.register('confirmPassword')}
          error={form.formState.errors.confirmPassword?.message}
        />
      </div>
      <div className="grid grid-cols-2 gap-8">
        <div />
        <Button type="submit" className="w-full" size="lg">
          Create account
        </Button>
      </div>
    </form>
  );
}
