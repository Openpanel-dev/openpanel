import { zodResolver } from '@hookform/resolvers/zod';
import type { CohortDefinition } from '@openpanel/core/modules/cohort/cohort.constants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { CohortCriteriaBuilder } from '@/components/cohort/cohort-criteria-builder';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAppParams } from '@/hooks/use-app-params';
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';
import { handleError, useTRPC } from '@/integrations/trpc/react';

const validator = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string().optional(),
  definition: z.any(),
  isStatic: z.boolean().default(false),
});

type IForm = z.infer<typeof validator>;

export default function AddCohort() {
  const { t: translateUi } = useDashboardTranslation();

  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState, control } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: '',
      description: '',
      definition: {
        type: 'event',
        criteria: {
          events: [],
          operator: 'or',
        },
      },
      isStatic: false,
    },
  });

  const mutation = useMutation(
    trpc.cohort.create.mutationOptions({
      onSuccess() {
        toast('Success', { description: 'Cohort created.' });
        queryClient.invalidateQueries(trpc.cohort.pathFilter());
        popModal();
      },
      onError: handleError,
    })
  );

  return (
    <ModalContent className="max-w-3xl">
      <ModalHeader title={translateUi('Create cohort')} />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((data) => {
          mutation.mutate({
            ...data,
            projectId,
            definition: data.definition as CohortDefinition,
          });
        })}
      >
        <InputWithLabel
          label={translateUi('Name')}
          placeholder={translateUi('Name of the cohort')}
          {...register('name')}
        />

        <WithLabel label={translateUi('Description')}>
          <Textarea
            placeholder={translateUi('Optional description')}
            {...register('description')}
          />
        </WithLabel>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="isStatic"
            render={({ field }) => (
              <Switch
                checked={field.value}
                id="isStatic"
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Label className="mb-0 cursor-pointer text-sm" htmlFor="isStatic">
            <DashboardText
              i18nKey={"Freeze snapshot (don't auto-refresh)"}
            />{' '}
          </Label>
        </div>

        <div>
          <Label className="mb-2 block">
            <DashboardText i18nKey={'Cohort Criteria'} />
          </Label>
          <Controller
            control={control}
            name="definition"
            render={({ field }) => (
              <CohortCriteriaBuilder
                definition={field.value as CohortDefinition}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        <DialogFooter>
          <Button onClick={() => popModal()} type="button" variant="outline">
            <DashboardText i18nKey={'Cancel'} />{' '}
          </Button>
          <Button disabled={!formState.isDirty} type="submit">
            <DashboardText i18nKey={'Create'} />{' '}
          </Button>
        </DialogFooter>
      </form>
    </ModalContent>
  );
}
