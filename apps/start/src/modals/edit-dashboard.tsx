import { zodResolver } from '@hookform/resolvers/zod';
import type { IServiceDashboard } from '@openpanel/core';
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
import { useTRPC } from '@/integrations/trpc/react';

type EditDashboardProps = Exclude<IServiceDashboard, null>;

const validator = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

type IForm = z.infer<typeof validator>;

export default function EditDashboard({ id, name }: EditDashboardProps) {
  const { t: translateUi } = useDashboardTranslation();

  const { register, handleSubmit, reset, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      id,
      name,
    },
  });

  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.dashboard.update.mutationOptions({
      onSuccess() {
        reset();
        toast('Success', {
          description: 'Dashboard updated.',
        });
        popModal();
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
      },
    })
  );

  return (
    <ModalContent>
      <ModalHeader title={translateUi('Edit dashboard')} />
      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <InputWithLabel
          label={translateUi('Name')}
          placeholder={translateUi('Name')}
          {...register('name')}
          defaultValue={name}
        />
        <DialogFooter>
          <Button onClick={() => popModal()} type="button" variant="outline">
            <DashboardText i18nKey={'Cancel'} />{' '}
          </Button>
          <Button disabled={!formState.isDirty} type="submit">
            <DashboardText i18nKey={'Update'} />{' '}
          </Button>
        </DialogFooter>
      </form>
    </ModalContent>
  );
}
