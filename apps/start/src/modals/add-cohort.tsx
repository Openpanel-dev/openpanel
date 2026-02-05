import { ButtonContainer } from '@/components/button-container';
import { CohortCriteriaBuilder } from '@/components/cohort/cohort-criteria-builder';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { TextareaWithLabel } from '@/components/forms/textarea-with-label';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CohortDefinition } from '@openpanel/validation';
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
  computeOnDemand: z.boolean().default(true),
});

type IForm = z.infer<typeof validator>;

export default function AddCohort() {
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
      computeOnDemand: true,
    },
  });

  const mutation = useMutation(
    trpc.cohort.create.mutationOptions({
      onSuccess() {
        toast('Success', {
          description: 'Cohort created.',
        });
        queryClient.invalidateQueries(trpc.cohort.pathFilter());
        popModal();
      },
      onError: handleError,
    }),
  );

  return (
    <ModalContent className="max-w-3xl">
      <ModalHeader title="Create cohort" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((data) => {
          mutation.mutate({
            ...data,
            projectId,
            // Static cohorts are stored (computeOnDemand=false)
            // Dynamic cohorts are computed on-demand (computeOnDemand=true)
            computeOnDemand: !data.isStatic,
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

        <div className="flex items-center gap-2">
          <Controller
            name="isStatic"
            control={control}
            render={({ field }) => (
              <Switch
                id="isStatic"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Label htmlFor="isStatic" className="text-sm cursor-pointer">
            Static cohort (one-time snapshot)
          </Label>
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
            Create
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
