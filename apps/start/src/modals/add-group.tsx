import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

interface IForm {
  id: string;
  type: string;
  name: string;
  properties: { key: string; value: string }[];
}

export default function AddGroup() {
  const { projectId } = useAppParams();
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const { register, handleSubmit, control, formState } = useForm<IForm>({
    defaultValues: {
      id: '',
      type: '',
      name: '',
      properties: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'properties',
  });

  const mutation = useMutation(
    trpc.group.create.mutationOptions({
      onSuccess() {
        queryClient.invalidateQueries(trpc.group.list.pathFilter());
        queryClient.invalidateQueries(trpc.group.types.pathFilter());
        toast('Success', { description: 'Group created.' });
        popModal();
      },
      onError: handleError,
    }),
  );

  return (
    <ModalContent>
      <ModalHeader title="Add group" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(({ properties, ...values }) => {
          const props = Object.fromEntries(
            properties
              .filter((p) => p.key.trim() !== '')
              .map((p) => [p.key.trim(), String(p.value)]),
          );
          mutation.mutate({ projectId, ...values, properties: props });
        })}
      >
        <InputWithLabel label="ID" placeholder="acme-corp" {...register('id', { required: true })} autoFocus />
        <InputWithLabel label="Name" placeholder="Acme Corp" {...register('name', { required: true })} />
        <InputWithLabel label="Type" placeholder="company" {...register('type', { required: true })} />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Properties</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ key: '', value: '' })}
            >
              <PlusIcon className="mr-1 size-3" />
              Add
            </Button>
          </div>
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
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
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => remove(index)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!formState.isDirty || mutation.isPending}>
            Create
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
