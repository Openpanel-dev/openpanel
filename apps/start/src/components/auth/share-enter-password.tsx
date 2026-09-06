import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ISignInShare,
  zSignInShare,
} from '@openpanel/core/modules/auth/auth.constants';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PublicPageCard } from '../public-page-card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useTRPC } from '@/integrations/trpc/react';

export function ShareEnterPassword({
  shareId,
  shareType = 'overview',
}: {
  shareId: string;
  shareType?: 'overview' | 'dashboard' | 'report';
}) {
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.signInShare.mutationOptions({
      onSuccess() {
        window.location.reload();
      },
      onError() {
        toast.error('Incorrect password');
      },
    })
  );
  const form = useForm<ISignInShare>({
    resolver: zodResolver(zSignInShare),
    defaultValues: {
      password: '',
      shareId,
      shareType,
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    mutation.mutate({
      password: data.password,
      shareId,
      shareType,
    });
  });

  const typeLabel =
    shareType === 'dashboard'
      ? 'Dashboard'
      : shareType === 'report'
        ? 'Report'
        : 'Overview';

  return (
    <PublicPageCard
      description={`Please enter correct password to access this ${typeLabel.toLowerCase()}`}
      title={`${typeLabel} is locked`}
    >
      <form className="col gap-4" onSubmit={onSubmit}>
        <Input
          {...form.register('password')}
          placeholder="Enter your password"
          size="large"
          type="password"
        />
        <Button type="submit">Get access</Button>
      </form>
    </PublicPageCard>
  );
}
