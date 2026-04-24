import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { zCreateHermesIntegration } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { path, mergeDeepRight } from 'ramda';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

type IForm = z.infer<typeof zCreateHermesIntegration>;

const DEFAULT_WEBHOOK_URL =
  'https://console.dashverse.ai/push/api/flow-trigger';

export function HermesIntegrationForm({
  defaultValues,
  onSuccess,
}: {
  defaultValues?: RouterOutputs['integration']['get'];
  onSuccess: () => void;
}) {
  const { organizationId } = useAppParams();
  const form = useForm<IForm>({
    defaultValues: mergeDeepRight(
      {
        id: defaultValues?.id,
        organizationId,
        config: {
          type: 'hermes' as const,
          webhookUrl: DEFAULT_WEBHOOK_URL,
        },
      },
      defaultValues ?? {},
    ),
    resolver: zodResolver(zCreateHermesIntegration),
  });
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.integration.createOrUpdate.mutationOptions({
      onSuccess,
      onError() {
        toast.error('Failed to create integration');
      },
    }),
  );

  const handleSubmit = (values: IForm) => {
    mutation.mutate(values);
  };

  const handleError = () => {
    toast.error('Validation error');
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit, handleError)}
      className="col gap-4"
    >
      <InputWithLabel
        label="Name"
        placeholder="Eg. Dashverse Push"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <InputWithLabel
        label="Webhook URL"
        placeholder={DEFAULT_WEBHOOK_URL}
        {...form.register('config.webhookUrl')}
        error={path(
          ['config', 'webhookUrl', 'message'],
          form.formState.errors,
        )}
      />
      <Button type="submit">
        {defaultValues?.id ? 'Update' : 'Create'}
      </Button>
    </form>
  );
}
