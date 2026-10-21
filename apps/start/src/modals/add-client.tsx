import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SaveIcon } from 'lucide-react';
import type { SubmitHandler } from 'react-hook-form';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { CreateClientSuccess } from '@/components/clients/create-client-success';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { Button, buttonVariants } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DialogFooter } from '@/components/ui/dialog';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

type ClientType = 'write' | 'read' | 'root';

const CLIENT_TYPE_ITEMS: { value: ClientType; label: string }[] = [
  { value: 'write', label: 'Write (for ingestion)' },
  { value: 'read', label: 'Read (access export API)' },
  { value: 'root', label: 'Root (access export API)' },
];

const CLIENT_TYPE_HINTS: Record<ClientType, string> = {
  write: 'The default client type, used for ingesting data',
  read: "Can read this project's data from the export API",
  root: "Can read any project's data from the export API",
};

const validation = z.object({
  name: z.string().min(1),
  type: z.enum(['read', 'write', 'root']),
});

type IForm = z.infer<typeof validation>;

export interface AddClientProps {
  name?: string;
  type?: IForm['type'];
}

export default function AddClient({ name, type }: AddClientProps = {}) {
  const { organizationId, projectId } = useAppParams();
  const form = useForm<IForm>({
    resolver: zodResolver(validation),
    defaultValues: {
      name: name ?? '',
      type: type ?? 'write',
    },
  });
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.client.create.mutationOptions({
      onSuccess() {
        toast.success('Client created successfully');
        queryClient.invalidateQueries(
          trpc.project.getProjectWithClients.pathFilter()
        );
        queryClient.invalidateQueries(
          trpc.client.list.queryFilter({ projectId })
        );
      },
      onError: handleError,
    })
  );

  const onSubmit: SubmitHandler<IForm> = (values) => {
    mutation.mutate({
      name: values.name,
      type: values.type,
      projectId,
      organizationId,
    });
  };

  return (
    <ModalContent>
      {mutation.isSuccess ? (
        <>
          <ModalHeader text={'Your client is created'} title="Success" />
          <CreateClientSuccess {...mutation.data} />
          <div className="mt-4 flex gap-4">
            <a
              className={cn(buttonVariants({ variant: 'secondary' }), 'flex-1')}
              href="https://openpanel.dev/docs"
              rel="noreferrer"
              target="_blank"
            >
              Read docs
            </a>
            <Button className="flex-1" onClick={() => popModal()}>
              Close
            </Button>
          </div>
        </>
      ) : (
        <>
          <ModalHeader title="Create a client" />
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <InputWithLabel
              error={form.formState.errors.name?.message}
              label="Client name"
              placeholder="Eg. My App Client"
              {...form.register('name')}
            />

            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <WithLabel
                  hint={CLIENT_TYPE_HINTS[field.value]}
                  label="Type of client"
                >
                  <Combobox
                    {...field}
                    className="w-full"
                    items={CLIENT_TYPE_ITEMS}
                    onChange={field.onChange}
                    placeholder="Select a client type"
                    variant="input"
                  />
                </WithLabel>
              )}
            />
            <DialogFooter>
              <Button
                onClick={() => popModal()}
                type="button"
                variant={'secondary'}
              >
                Cancel
              </Button>
              <Button
                icon={SaveIcon}
                loading={mutation.isPending}
                type="submit"
              >
                Create
              </Button>
            </DialogFooter>
          </form>
        </>
      )}
    </ModalContent>
  );
}
