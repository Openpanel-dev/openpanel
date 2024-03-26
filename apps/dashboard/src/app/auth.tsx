'use client';

import { useState } from 'react';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Logo } from '@/components/logo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody } from '@/components/widget';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeySquareIcon } from 'lucide-react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const validator = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type IForm = z.infer<typeof validator>;
export default function Auth() {
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
  });
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<string | null>(null);
  return (
    <div className="flex h-screen flex-col items-center justify-center p-4">
      <Widget className="mb-4 w-full max-w-md">
        <WidgetBody>
          <div className="flex justify-center py-8">
            <Logo />
          </div>
          <form
            onSubmit={form.handleSubmit(async (values) => {
              const res = await signIn('credentials', {
                email: values.email,
                password: values.password,
                redirect: false,
              }).catch(() => {
                setState('Something went wrong. Please try again later');
              });

              if (res?.ok) {
                router.refresh();
              }

              if (res?.status === 401) {
                setState('Wrong email or password. Please try again');
              }
            })}
            className="flex flex-col gap-4"
          >
            <InputWithLabel
              label="Email"
              placeholder="Your email"
              error={form.formState.errors.email?.message}
              {...form.register('email')}
            />
            <InputWithLabel
              label="Password"
              placeholder="...and your password"
              error={form.formState.errors.password?.message}
              {...form.register('password')}
            />
            {state !== null && (
              <Alert variant="destructive">
                <KeySquareIcon className="h-4 w-4" />
                <AlertTitle>Failed</AlertTitle>
                <AlertDescription>{state}</AlertDescription>
              </Alert>
            )}
            <Button type="submit">Sign in</Button>
            <Link href="/register" className="text-center text-sm">
              No account?{' '}
              <span className="font-medium text-blue-600">Sign up here!</span>
            </Link>
          </form>
        </WidgetBody>
      </Widget>
      <p className="text-xs">Terms & conditions</p>
    </div>
  );
}
