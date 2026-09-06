import { zodResolver } from '@hookform/resolvers/zod';
import { zCreateDiscordIntegration } from '@openpanel/core/modules/integration/integration.constants';
import { useMutation } from '@tanstack/react-query';
import { mergeDeepRight, path } from 'ramda';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';

type IForm = z.infer<typeof zCreateDiscordIntegration>;

export function DiscordIntegrationForm({
  defaultValues,
  onSuccess,
}: {
  defaultValues?: RouterOutputs['integration']['get'];
  onSuccess: () => void;
}) {
  const { projectId } = useAppParams();
  const form = useForm<IForm>({
    defaultValues: mergeDeepRight(
      {
        id: defaultValues?.id,
        projectId,
        config: {
          type: 'discord' as const,
          url: '',
          headers: {},
        },
      },
      defaultValues ?? {}
    ),
    resolver: zodResolver(zCreateDiscordIntegration),
  });
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.integration.createOrUpdate.mutationOptions({
      onSuccess,
      onError() {
        toast.error('Failed to create integration');
      },
    })
  );

  const handleSubmit = (values: IForm) => {
    mutation.mutate(values);
  };

  const handleError = () => {
    toast.error('Validation error');
  };

  const testMutation = useMutation(
    trpc.integration.testConnection.mutationOptions()
  );

  const handleTest = async () => {
    const url = form.getValues('config.url');
    if (!url) {
      return toast.error('Webhook URL is required');
    }
    const res = await testMutation.mutateAsync({
      projectId,
      config: { type: 'discord', url },
    });
    if (res.success) {
      toast.success('Test notification sent');
    } else {
      toast.error('Failed to send test notification');
    }
  };

  return (
    <form
      className="col gap-4"
      onSubmit={form.handleSubmit(handleSubmit, handleError)}
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
        <Button onClick={handleTest} type="button" variant="outline">
          Test connection
        </Button>
        <Button className="flex-1" type="submit">
          Create
        </Button>
      </div>
    </form>
  );
}
