import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import { type RouterOutputs, api } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { sendTestDiscordNotification } from '@openpanel/integrations/src/discord';
import { zCreateDiscordIntegration } from '@openpanel/validation';
import { path, mergeDeepRight } from 'ramda';
import { useForm } from 'react-hook-form';
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
  const { organizationId, projectId } = useAppParams();
  const form = useForm<IForm>({
    defaultValues: mergeDeepRight(
      {
        id: defaultValues?.id,
        organizationId,
        projectId,
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
  const mutation = api.integration.createOrUpdate.useMutation({
    onSuccess,
    onError() {
      toast.error('Failed to create integration');
    },
  });

  const handleSubmit = (values: IForm) => {
    mutation.mutate(values);
  };

  const handleError = () => {
    toast.error('Validation error');
  };

  const handleTest = async () => {
    const webhookUrl = form.getValues('config.url');
    if (!webhookUrl) {
      return toast.error('Webhook URL is required');
    }
    const res = await sendTestDiscordNotification(webhookUrl);
    if (res.ok) {
      toast.success('Test notification sent');
    } else {
      toast.error('Failed to send test notification');
    }
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit, handleError)}
      className="col gap-4"
    >
      <InputWithLabel
        label="Name"
        placeholder="Eg. My personal discord"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <InputWithLabel
        label="Discord Webhook URL"
        {...form.register('config.url')}
        error={path(['config', 'url', 'message'], form.formState.errors)}
      />
      <div className="row gap-4">
        <Button type="button" variant="outline" onClick={handleTest}>
          Test connection
        </Button>
        <Button type="submit" className="flex-1">
          Create
        </Button>
      </div>
    </form>
  );
}
