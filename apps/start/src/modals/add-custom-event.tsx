import { ButtonContainer } from '@/components/button-container';
import { CustomEventBuilder } from '@/components/custom-event/custom-event-builder';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { TextareaWithLabel } from '@/components/forms/textarea-with-label';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validator = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string().optional(),
  definition: z.any(), // ICustomEventDefinition validation happens in backend
  conversion: z.boolean().default(false),
});

type IForm = z.infer<typeof validator>;

export default function AddCustomEvent() {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState, control } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: '',
      description: '',
      definition: {
        operator: 'or',
        events: [],
      },
      conversion: false,
    },
  });

  const mutation = useMutation(
    trpc.customEvent.create.mutationOptions({
      onSuccess() {
        toast('Success', {
          description: 'Custom event created.',
        });
        queryClient.invalidateQueries(trpc.customEvent.pathFilter());
        queryClient.invalidateQueries(trpc.chart.pathFilter());
        popModal();
      },
      onError: handleError,
    }),
  );

  return (
    <ModalContent className="max-w-3xl">
      <ModalHeader title="Create custom event" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((data) => {
          mutation.mutate({
            ...data,
            projectId,
          });
        })}
      >
        <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">
          <p className="font-medium">What are custom events?</p>
          <p className="mt-1 text-blue-700">
            Custom events combine multiple source events into a single metric. For example,
            combine "button_click", "form_submit", and "link_click" into "User Engagement".
          </p>
        </div>

        <InputWithLabel
          label="Name"
          placeholder="e.g., User Engagement"
          {...register('name')}
          error={formState.errors.name?.message}
        />

        <TextareaWithLabel
          label="Description"
          placeholder="Optional description"
          {...register('description')}
        />

        <div className="flex items-center gap-2">
          <Switch id="conversion" {...register('conversion')} />
          <Label htmlFor="conversion" className="text-sm cursor-pointer">
            Mark as conversion event
          </Label>
        </div>

        <div className="rounded-md border p-4">
          <Controller
            name="definition"
            control={control}
            render={({ field }) => (
              <CustomEventBuilder
                value={field.value}
                onChange={field.onChange}
                projectId={projectId}
              />
            )}
          />
        </div>

        <ButtonContainer>
          <Button
            type="button"
            variant="outline"
            onClick={() => popModal()}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Create custom event
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
