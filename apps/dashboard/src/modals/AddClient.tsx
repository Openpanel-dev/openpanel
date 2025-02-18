'use client';

import { CreateClientSuccess } from '@/components/clients/create-client-success';
import { Button, buttonVariants } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { zodResolver } from '@hookform/resolvers/zod';
import { SaveIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { SubmitHandler } from 'react-hook-form';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validation = z.object({
  name: z.string().min(1),
  type: z.enum(['read', 'write', 'root']),
});

type IForm = z.infer<typeof validation>;

export default function AddClient() {
  const { organizationId, projectId } = useAppParams();
  const router = useRouter();
  const form = useForm<IForm>({
    resolver: zodResolver(validation),
    defaultValues: {
      name: '',
      type: 'write',
    },
  });
  const mutation = api.client.create.useMutation({
    onError: handleError,
    onSuccess() {
      toast.success('Client created');
      router.refresh();
    },
  });
  const query = api.project.list.useQuery({
    organizationId,
  });
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
          <ModalHeader title="Success" text={'Your client is created'} />
          <CreateClientSuccess {...mutation.data} />
          <div className="mt-4 flex gap-4">
            <a
              className={cn(buttonVariants({ variant: 'secondary' }), 'flex-1')}
              href="https://openpanel.dev/docs"
              target="_blank"
              rel="noreferrer"
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
            <div>
              <Label>Client name</Label>
              <Input
                placeholder="Eg. My App Client"
                error={form.formState.errors.name?.message}
                {...form.register('name')}
              />
            </div>

            <div>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => {
                  return (
                    <div>
                      <Label>Type of client</Label>
                      <Combobox
                        {...field}
                        className="w-full"
                        onChange={(value) => {
                          field.onChange(value);
                        }}
                        items={[
                          {
                            value: 'write',
                            label: 'Write (for ingestion)',
                          },
                          {
                            value: 'read',
                            label: 'Read (access export API)',
                          },
                          {
                            value: 'root',
                            label: 'Root (access export API)',
                          },
                        ]}
                        placeholder="Select a project"
                      />
                      <p className="mt-2 text-sm text-muted-foreground">
                        {field.value === 'write' &&
                          'Write: Is the default client type and is used for ingestion of data'}
                        {field.value === 'read' &&
                          'Read: You can access the current projects data from the export API'}
                        {field.value === 'root' &&
                          'Root: You can access any projects data from the export API'}
                      </p>
                    </div>
                  );
                }}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant={'secondary'}
                onClick={() => popModal()}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                icon={SaveIcon}
                loading={mutation.isLoading}
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
