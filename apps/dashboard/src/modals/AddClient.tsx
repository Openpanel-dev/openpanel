'use client';

import AnimateHeight from '@/components/animate-height';
import { CreateClientSuccess } from '@/components/clients/create-client-success';
import TagInput from '@/components/forms/tag-input';
import { Button, buttonVariants } from '@/components/ui/button';
import { CheckboxInput } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { zodResolver } from '@hookform/resolvers/zod';
import { SaveIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SubmitHandler } from 'react-hook-form';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validation = z.object({
  name: z.string().min(1),
  cors: z.string().min(1).or(z.literal('')),
  projectId: z.string(),
  type: z.enum(['read', 'write', 'root']),
  crossDomain: z.boolean().optional(),
});

type IForm = z.infer<typeof validation>;

interface Props {
  projectId: string;
}
export default function AddClient(props: Props) {
  const { organizationSlug, projectId } = useAppParams();
  const router = useRouter();
  const form = useForm<IForm>({
    resolver: zodResolver(validation),
    defaultValues: {
      name: '',
      cors: '',
      projectId: props.projectId ?? projectId,
      type: 'write',
      crossDomain: undefined,
    },
  });
  const [hasDomain, setHasDomain] = useState(true);
  const mutation = api.client.create.useMutation({
    onError: handleError,
    onSuccess() {
      toast.success('Client created');
      router.refresh();
    },
  });
  const query = api.project.list.useQuery({
    organizationSlug,
  });
  const onSubmit: SubmitHandler<IForm> = (values) => {
    if (hasDomain && values.cors === '') {
      return form.setError('cors', {
        type: 'required',
        message: 'Please add a domain',
      });
    }
    mutation.mutate({
      name: values.name,
      cors: hasDomain ? values.cors : null,
      projectId: values.projectId,
      organizationSlug,
      type: values.type,
      crossDomain: values.crossDomain,
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
              href="https://docs.openpanel.dev/docs"
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
              <Controller
                control={form.control}
                name="projectId"
                render={({ field }) => {
                  return (
                    <div>
                      <Label>Project</Label>
                      <Combobox
                        {...field}
                        className="w-full"
                        onChange={(value) => {
                          field.onChange(value);
                        }}
                        items={
                          query.data?.map((item) => ({
                            value: item.id,
                            label: item.name,
                          })) ?? []
                        }
                        placeholder="Select a project"
                      />
                    </div>
                  );
                }}
              />
            </div>
            <div>
              <Label>Client name</Label>
              <Input
                placeholder="Eg. My App Client"
                error={form.formState.errors.name?.message}
                {...form.register('name')}
              />
            </div>

            <div>
              <Label className="flex items-center justify-between">
                <span>Domain(s)</span>
                <Switch checked={hasDomain} onCheckedChange={setHasDomain} />
              </Label>
              <AnimateHeight open={hasDomain}>
                <Controller
                  name="cors"
                  control={form.control}
                  render={({ field }) => (
                    <TagInput
                      {...field}
                      error={form.formState.errors.cors?.message}
                      placeholder="Add a domain"
                      value={field.value?.split(',') ?? []}
                      renderTag={(tag) =>
                        tag === '*' ? 'Allow all domains' : tag
                      }
                      onChange={(newValue) => {
                        field.onChange(
                          newValue
                            .map((item) => {
                              const trimmed = item.trim();
                              if (
                                trimmed.startsWith('http://') ||
                                trimmed.startsWith('https://') ||
                                trimmed === '*'
                              ) {
                                return trimmed;
                              }
                              return `https://${trimmed}`;
                            })
                            .join(','),
                        );
                      }}
                    />
                  )}
                />
                <Controller
                  name="crossDomain"
                  control={form.control}
                  render={({ field }) => {
                    return (
                      <CheckboxInput
                        className="mt-4"
                        ref={field.ref}
                        onBlur={field.onBlur}
                        defaultChecked={field.value}
                        onCheckedChange={field.onChange}
                      >
                        <div>Enable cross domain support</div>
                        <div className="font-normal text-muted-foreground">
                          This will let you track users across multiple domains
                        </div>
                      </CheckboxInput>
                    );
                  }}
                />
              </AnimateHeight>
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
                      <p className="mt-1 text-sm text-muted-foreground">
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
