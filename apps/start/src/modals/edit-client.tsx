import { zodResolver } from '@hookform/resolvers/zod';
import type { IPublicClient } from '@openpanel/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';
import { handleError, useTRPC } from '@/integrations/trpc/react';

type EditClientProps = IPublicClient;

const validator = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

type IForm = z.infer<typeof validator>;

export default function EditClient({ id, name }: EditClientProps) {
  const { t: translateUi } = useDashboardTranslation();

  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState, control, setError } =
    useForm<IForm>({
      resolver: zodResolver(validator),
      defaultValues: {
        id,
        name,
      },
    });

  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.client.update.mutationOptions({
      onError: handleError,
      onSuccess() {
        reset();
        toast('Success', {
          description: 'Client updated.',
        });
        popModal();
        queryClient.invalidateQueries(trpc.client.list.pathFilter());
      },
    })
  );

  return (
    <ModalContent>
      <ModalHeader title={translateUi('Edit client')} />
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <InputWithLabel
          label={translateUi('Name')}
          placeholder={translateUi('Name')}
          {...register('name')}
        />
        <DialogFooter>
          <Button onClick={() => popModal()} type="button" variant="outline">
            <DashboardText i18nKey={'Cancel'} />{' '}
          </Button>
          <Button disabled={!formState.isDirty} type="submit">
            <DashboardText i18nKey={'Save'} />{' '}
          </Button>
        </DialogFooter>
      </form>
    </ModalContent>
  );
}
