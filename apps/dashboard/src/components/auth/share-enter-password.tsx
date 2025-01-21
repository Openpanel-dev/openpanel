'use client';

import { ModalHeader } from '@/modals/Modal/Container';
import { api } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ISignInShare, zSignInShare } from '@openpanel/validation';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { LogoSquare } from '../logo';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export function ShareEnterPassword({ shareId }: { shareId: string }) {
  const router = useRouter();
  const mutation = api.auth.signInShare.useMutation({
    onSuccess() {
      router.refresh();
    },
    onError() {
      toast.error('Incorrect password');
    },
  });
  const form = useForm<ISignInShare>({
    resolver: zodResolver(zSignInShare),
    defaultValues: {
      password: '',
      shareId,
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    mutation.mutate({
      password: data.password,
      shareId,
    });
  });

  return (
    <div className="center-center h-screen w-screen p-4 col">
      <div className="bg-background p-6 rounded-lg max-w-md w-full text-left">
        <div className="col mt-1 flex-1 gap-2">
          <LogoSquare className="size-12 mb-4" />
          <div className="text-xl font-semibold">Overview is locked</div>
          <div className="text-lg text-muted-foreground leading-normal">
            Please enter correct password to access this overview
          </div>
        </div>
        <form onSubmit={onSubmit} className="col gap-4 mt-6">
          <Input
            {...form.register('password')}
            type="password"
            placeholder="Enter your password"
            size="large"
          />
          <Button type="submit">Get access</Button>
        </form>
      </div>
      <div className="p-6 text-xs max-w-sm col gap-0.5">
        <p>
          Powered by{' '}
          <a href="https://openpanel.dev" className="font-medium">
            OpenPanel.dev
          </a>
        </p>
        <p>
          The best web and product analytics tool out there (our honest
          opinion).
        </p>
        <p>
          <a href="https://dashboard.openpanel.dev/onboarding">
            Try it for free today!
          </a>
        </p>
      </div>
    </div>
  );
}
