import { useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ISignInShare, zSignInShare } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PublicPageCard } from '../public-page-card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

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
    }),
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
      title={`${typeLabel} is locked`}
      description={`Please enter correct password to access this ${typeLabel.toLowerCase()}`}
    >
      <form onSubmit={onSubmit} className="col gap-4">
        <Input
          {...form.register('password')}
          type="password"
          placeholder="Enter your password"
          size="large"
        />
        <Button type="submit">Get access</Button>
      </form>
    </PublicPageCard>
  );
}
