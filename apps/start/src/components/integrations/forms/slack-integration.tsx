import { zodResolver } from '@hookform/resolvers/zod';
import { zCreateSlackIntegration } from '@openpanel/core/modules/integration/integration.constants';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';

type IForm = z.infer<typeof zCreateSlackIntegration>;

export function SlackIntegrationForm({
  defaultValues,
  onSuccess,
}: {
  defaultValues?: RouterOutputs['integration']['get'];
  onSuccess: () => void;
}) {
  const { projectId } = useAppParams();

  const form = useForm<IForm>({
    defaultValues: {
      id: defaultValues?.id,
      projectId,
      name: defaultValues?.name ?? '',
    },
    resolver: zodResolver(zCreateSlackIntegration),
  });
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.integration.createOrUpdateSlack.mutationOptions({
      async onSuccess(res) {
        window.location.href = res.slackInstallUrl;
        onSuccess();
      },
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

  return (
    <form
      className="col gap-4"
      onSubmit={form.handleSubmit(handleSubmit, handleError)}
    >
      <InputWithLabel
        label="Name"
        placeholder="Eg. My personal slack"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <Button type="submit">Create</Button>
    </form>
  );
}
