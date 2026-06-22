import { useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ISignInShare, zSignInShare } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.signInShare.mutationOptions({
      onSuccess() {
        window.location.reload();
      },
      onError() {
        toast.error(t('auth.incorrect_password'));
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
      ? t('auth.share_type_dashboard')
      : shareType === 'report'
        ? t('auth.share_type_report')
        : t('auth.share_type_overview');

  return (
    <PublicPageCard
      title={t('auth.share_locked_title', { type: typeLabel })}
      description={t('auth.share_password_description', {
        type: typeLabel.toLowerCase(),
      })}
    >
      <form onSubmit={onSubmit} className="col gap-4">
        <Input
          {...form.register('password')}
          type="password"
          placeholder={t('auth.enter_password')}
          size="large"
        />
        <Button type="submit">{t('auth.get_access')}</Button>
      </form>
    </PublicPageCard>
  );
}
