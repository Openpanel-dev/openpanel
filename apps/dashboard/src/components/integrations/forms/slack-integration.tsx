import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import useWS from '@/hooks/useWS';
import { popModal } from '@/modals';
import { type RouterOutputs, api } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { zCreateSlackIntegration } from '@openpanel/validation';
import { useQueryClient } from '@tanstack/react-query';
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
  const popup = useRef<Window | null>(null);
  const { organizationId } = useAppParams();
  const client = useQueryClient();
  useWS('/live/integrations/slack', (res) => {
    if (popup.current) {
      popup.current.close();
    }
    onSuccess();
  });
  const form = useForm<IForm>({
    defaultValues: {
      id: defaultValues?.id,
      organizationId,
      name: defaultValues?.name ?? '',
    },
    resolver: zodResolver(zCreateSlackIntegration),
  });
  const mutation = api.integration.createOrUpdateSlack.useMutation({
    async onSuccess(res) {
      const url = res.slackInstallUrl;
      const width = 600;
      const height = 800;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2.5;
      popup.current = window.open(
        url,
        '',
        `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=${width}, height=${height}, top=${top}, left=${left}`,
      );

      // The popup might have been blocked, so we redirect the user to the URL instead
      if (!popup.current) {
        window.location.href = url;
      }
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
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <Button type="submit">Create</Button>
    </form>
  );
}
