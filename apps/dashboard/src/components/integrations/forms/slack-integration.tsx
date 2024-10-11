import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import useWS from '@/hooks/useWS';
import { type RouterOutputs, api } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { zCreateSlackIntegration } from '@openpanel/validation';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

type IForm = z.infer<typeof zCreateSlackIntegration>;

export function SlackIntegrationForm({
  defaultValues,
  onSuccess,
}: {
  defaultValues?: RouterOutputs['integration']['get'];
  onSuccess: () => void;
}) {
  const { organizationId, projectId } = useAppParams();

  const form = useForm<IForm>({
    defaultValues: {
      id: defaultValues?.id,
      organizationId,
      projectId,
      name: defaultValues?.name ?? '',
    },
    resolver: zodResolver(zCreateSlackIntegration),
  });
  const mutation = api.integration.createOrUpdateSlack.useMutation({
    async onSuccess(res) {
      window.location.href = res.slackInstallUrl;
    },
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

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit, handleError)}
      className="col gap-4"
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
