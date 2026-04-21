import { ButtonContainer } from '@/components/button-container';
import { CohortCriteriaBuilder } from '@/components/cohort/cohort-criteria-builder';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
  definition: z.any(),
  isStatic: z.boolean().default(false),
});

type IForm = z.infer<typeof validator>;

interface EditCohortProps {
  id: string;
  name: string;
  description?: string | null;
  definition: CohortDefinition;
  isStatic: boolean;
}

export default function EditCohort(props: EditCohortProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState, control } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: props.name,
      description: props.description || '',
      definition: props.definition,
      isStatic: props.isStatic,
    },
  });

  const mutation = useMutation(
    trpc.cohort.update.mutationOptions({
      onSuccess() {
        toast('Success', { description: 'Cohort updated.' });
        queryClient.invalidateQueries(trpc.cohort.pathFilter());
        popModal();
      },
      onError: handleError,
    }),
  );

  return (
    <ModalContent className="max-w-3xl">
      <ModalHeader title="Edit cohort" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((data) => {
          mutation.mutate({
            id: props.id,
            name: data.name,
            description: data.description,
            definition: data.definition as CohortDefinition,
            isStatic: data.isStatic,
          });
        })}
      >
        <InputWithLabel
          label="Name"
          placeholder="Name of the cohort"
          {...register('name')}
        />

        <WithLabel label="Description">
          <Textarea
            placeholder="Optional description"
            {...register('description')}
          />
        </WithLabel>

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
          <Label htmlFor="isStatic" className="cursor-pointer text-sm">
            Freeze snapshot (don&apos;t auto-refresh)
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
            Save changes
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
