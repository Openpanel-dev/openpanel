import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { sendTestDiscordNotification } from '@openpanel/integrations/src/discord';
import { zCreateDiscordIntegration } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { path, mergeDeepRight } from 'ramda';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';

type IForm = z.infer<typeof zCreateDiscordIntegration>;

export function DiscordIntegrationForm({
  defaultValues,
  onSuccess,
}: {
  defaultValues?: RouterOutputs['integration']['get'];
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { organizationId } = useAppParams();
  const form = useForm<IForm>({
    defaultValues: mergeDeepRight(
      {
        id: defaultValues?.id,
        organizationId,
        config: {
          type: 'discord' as const,
          url: '',
          headers: {},
        },
      },
      defaultValues ?? {},
    ),
    resolver: zodResolver(zCreateDiscordIntegration),
  });
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.integration.createOrUpdate.mutationOptions({
      onSuccess,
      onError() {
        toast.error(t('integrations.error_create_failed'));
      },
    }),
  );

  const handleSubmit = (values: IForm) => {
    mutation.mutate(values);
  };

  const handleError = () => {
    toast.error(t('integrations.error_validation'));
  };

  const handleTest = async () => {
    const webhookUrl = form.getValues('config.url');
    if (!webhookUrl) {
      return toast.error(t('integrations.error_webhook_url_required'));
    }
    const res = await sendTestDiscordNotification(webhookUrl);
    if (res.ok) {
      toast.success(t('integrations.success_test_notification_sent'));
    } else {
      toast.error(t('integrations.error_test_notification_failed'));
    }
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit, handleError)}
      className="col gap-4"
    >
      <InputWithLabel
        label={t('integrations.field_name')}
        placeholder={t('integrations.discord_name_placeholder')}
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <InputWithLabel
        label={t('integrations.field_discord_webhook_url')}
        {...form.register('config.url')}
        error={path(['config', 'url', 'message'], form.formState.errors)}
      />
      <div className="row gap-4">
        <Button type="button" variant="outline" onClick={handleTest}>
          {t('integrations.action_test_connection')}
        </Button>
        <Button type="submit" className="flex-1">
          {t('integrations.action_create')}
        </Button>
      </div>
    </form>
  );
}
