import { zodResolver } from '@hookform/resolvers/zod';
import type { IServiceGroup } from '@openpanel/db';
import { zUpdateGroup } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { handleError, useTRPC } from '@/integrations/trpc/react';

const zForm = zUpdateGroup
  .omit({ id: true, projectId: true, properties: true })
  .extend({
    properties: z.array(z.object({ key: z.string(), value: z.string() })),
  });
type IForm = z.infer<typeof zForm>;

type EditGroupProps = Pick<
  IServiceGroup,
  'id' | 'projectId' | 'name' | 'type' | 'properties'
>;

export default function EditGroup({
  id,
  projectId,
  name,
  type,
  properties,
}: EditGroupProps) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const { register, handleSubmit, control, formState } = useForm<IForm>({
    resolver: zodResolver(zForm),
    defaultValues: {
      type,
      name,
      properties: Object.entries(properties as Record<string, string>).map(
        ([key, value]) => ({
          key,
          value: String(value),
        })
      ),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'properties',
  });

  const mutation = useMutation(
    trpc.group.update.mutationOptions({
      onSuccess() {
        queryClient.invalidateQueries(trpc.group.list.pathFilter());
        queryClient.invalidateQueries(trpc.group.byId.pathFilter());
        queryClient.invalidateQueries(trpc.group.types.pathFilter());
        toast('Success', { description: 'Group updated.' });
        popModal();
      },
      onError: handleError,
    })
  );

  return (
    <ModalContent>
      <ModalHeader title="Edit group" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(({ properties: formProps, ...values }) => {
          const props = Object.fromEntries(
            formProps
              .filter((p) => p.key.trim() !== '')
              .map((p) => [p.key.trim(), String(p.value)])
          );
          mutation.mutate({ id, projectId, ...values, properties: props });
        })}
      >
        <InputWithLabel
          label="Name"
          {...register('name')}
          error={formState.errors.name?.message}
        />
        <InputWithLabel
          label="Type"
          {...register('type')}
          error={formState.errors.type?.message}
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Properties</span>
            <Button
              onClick={() => append({ key: '', value: '' })}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon className="mr-1 size-3" />
              Add
            </Button>
          </div>
          {fields.map((field, index) => (
            <div className="flex gap-2" key={field.id}>
              <input
                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="key"
                {...register(`properties.${index}.key`)}
              />
              <input
                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="value"
                {...register(`properties.${index}.value`)}
              />
              <Button
                className="shrink-0"
                onClick={() => remove(index)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <ButtonContainer>
          <Button onClick={() => popModal()} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!formState.isDirty || mutation.isPending}
            type="submit"
          >
            Update
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
