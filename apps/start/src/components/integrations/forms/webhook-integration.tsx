import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { zCreateWebhookIntegration } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { path, mergeDeepRight } from 'ramda';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

type IForm = z.infer<typeof zCreateWebhookIntegration>;

export function WebhookIntegrationForm({
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
          type: 'webhook' as const,
          url: '',
          headers: {},
        },
      },
      defaultValues ?? {},
    ),
    resolver: zodResolver(zCreateWebhookIntegration),
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
        placeholder="Eg. Zapier webhook"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <InputWithLabel
        label="URL"
        {...form.register('config.url')}
        error={path(['config', 'url', 'message'], form.formState.errors)}
      />
      <Button type="submit">Create</Button>
    </form>
  );
}
