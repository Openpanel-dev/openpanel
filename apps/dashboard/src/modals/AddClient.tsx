'use client';

import { useState } from 'react';
import AnimateHeight from '@/components/animate-height';
import { CreateClientSuccess } from '@/components/clients/create-client-success';
import { Button, buttonVariants } from '@/components/ui/button';
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
import type { SubmitHandler } from 'react-hook-form';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validation = z.object({
  name: z.string().min(1),
  cors: z.string().url().or(z.literal('')),
  projectId: z.string(),
  type: z.enum(['read', 'write', 'root']),
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
    mutation.mutate({
      name: values.name,
      cors: hasDomain ? values.cors : null,
      projectId: values.projectId,
      organizationSlug,
      type: values.type,
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
                <span>Domain</span>
                <Switch checked={hasDomain} onCheckedChange={setHasDomain} />
              </Label>
              <AnimateHeight open={hasDomain}>
                <Input
                  placeholder="https://example.com"
                  error={form.formState.errors.cors?.message}
                  {...form.register('cors')}
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
                      <p className="mt-1 text-xs text-muted-foreground">
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

{
  /* <div>
  <div className="text-lg">
    Select your framework and we'll generate a client for you.
  </div>
  <div className="flex flex-wrap gap-2 mt-8">
    <FeatureButton
      name="React"
      logo="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/2300px-React-icon.svg.png"
    />
    <FeatureButton
      name="React Native"
      logo="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/2300px-React-icon.svg.png"
    />
    <FeatureButton
      name="Next.js"
      logo="https://static-00.iconduck.com/assets.00/nextjs-icon-512x512-y563b8iq.png"
    />
    <FeatureButton
      name="Remix"
      logo="https://www.datocms-assets.com/205/1642515307-square-logo.svg"
    />
    <FeatureButton
      name="Vue"
      logo="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ0UhQnp6TUPCwAr3ruTEwBDiTN5HLAWaoUD3AJIgtepQ&s"
    />
    <FeatureButton
      name="HTML"
      logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/HTML5_logo_and_wordmark.svg/240px-HTML5_logo_and_wordmark.svg.png"
    />
  </div>
</div> */
}
