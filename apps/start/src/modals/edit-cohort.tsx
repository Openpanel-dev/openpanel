import { ButtonContainer } from '@/components/button-container';
import { CohortCriteriaBuilder } from '@/components/cohort/cohort-criteria-builder';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { TextareaWithLabel } from '@/components/forms/textarea-with-label';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CohortDefinition } from '@openpanel/validation';
import type { Cohort } from '@openpanel/db';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validator = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string().optional(),
  definition: z.any(), // CohortDefinition validation happens in backend
  isStatic: z.boolean().default(false),
  computeOnDemand: z.boolean().default(false),
});

type IForm = z.infer<typeof validator>;

interface EditCohortProps {
  id: string;
  name: string;
  description?: string | null;
  definition: CohortDefinition | any;
  isStatic: boolean;
  computeOnDemand: boolean;
}

export default function EditCohort(props: EditCohortProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState, control, watch } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: props.name,
      description: props.description || '',
      definition: props.definition as CohortDefinition,
      isStatic: props.isStatic,
      computeOnDemand: props.computeOnDemand,
    },
  });

  const mutation = useMutation(
    trpc.cohort.update.mutationOptions({
      onSuccess() {
        toast('Success', {
          description: 'Cohort updated.',
        });
        queryClient.invalidateQueries(trpc.cohort.pathFilter());
        popModal();
      },
      onError: handleError,
    }),
  );

  const isStatic = watch('isStatic');

  return (
    <ModalContent className="max-w-3xl">
      <ModalHeader title="Edit cohort" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((data) => {
          mutation.mutate({
            id: props.id,
            ...data,
          });
        })}
      >
        <InputWithLabel
          label="Name"
          placeholder="Name of the cohort"
          {...register('name')}
        />

        <TextareaWithLabel
          label="Description"
          placeholder="Optional description"
          {...register('description')}
        />

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="isStatic" {...register('isStatic')} />
            <Label htmlFor="isStatic" className="text-sm cursor-pointer">
              Static cohort (doesn't auto-update)
            </Label>
          </div>

          {!isStatic && (
            <div className="flex items-center gap-2">
              <Switch id="computeOnDemand" {...register('computeOnDemand')} />
              <Label
                htmlFor="computeOnDemand"
                className="text-sm cursor-pointer"
              >
                Compute on-demand
              </Label>
            </div>
          )}
        </div>

        <div>
          <Label className="mb-2 block">Cohort Criteria</Label>
          <Controller
            name="definition"
            control={control}
            render={({ field }) => (
              <CohortCriteriaBuilder
                definition={field.value as CohortDefinition}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!formState.isDirty}>
            Save changes
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
