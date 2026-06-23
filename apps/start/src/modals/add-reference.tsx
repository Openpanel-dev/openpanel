import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';

import { zCreateReference } from '@openpanel/validation';

import { InputDateTime } from '@/components/ui/input-date-time';
import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type IForm = z.infer<typeof zCreateReference>;

interface AddReferenceProps {
  datetime?: string;
}

export default function AddReference({ datetime }: AddReferenceProps = {}) {
  const { t } = useTranslation();
  const { projectId } = useAppParams();
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState, control } = useForm<IForm>({
    resolver: zodResolver(zCreateReference),
    defaultValues: {
      title: '',
      description: '',
      projectId,
      datetime: datetime || new Date().toISOString(),
    },
  });

  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.reference.create.mutationOptions({
      onSuccess() {
        queryClient.invalidateQueries(trpc.reference.pathFilter());
        toast(t('common.success'), {
          description: t('references.toast_created'),
        });
        popModal();
      },
      onError: handleError,
    }),
  );

  return (
    <ModalContent>
      <ModalHeader title={t('references.add_reference')} />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
      >
        <InputWithLabel
          label={t('references.title')}
          {...register('title')}
          autoFocus
        />
        <InputWithLabel
          label={t('references.description')}
          {...register('description')}
        />
        <Controller
          control={control}
          name="datetime"
          render={({ field }) => (
            <InputDateTime {...field} label={t('references.date_and_time')} />
          )}
        />
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!formState.isDirty}>
            {t('common.create')}
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
