'use client';

import { CreateClientSuccess } from '@/components/clients/create-client-success';
import { Button, buttonVariants } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { zodResolver } from '@hookform/resolvers/zod';
import { SaveIcon, WallpaperIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SubmitHandler } from 'react-hook-form';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validation = z
  .object({
    name: z.string().min(1),
    cors: z.string().nullable(),
    tab: z.string(),
    projectId: z.string(),
  })
  .refine(
    (data) =>
      data.tab === 'other' || (data.tab === 'website' && data.cors !== ''),
    {
      message: 'Cors is required',
      path: ['cors'],
    }
  );

type IForm = z.infer<typeof validation>;

interface Props {
  projectId: string;
}
export default function AddClient(props: Props) {
  const { organizationId, projectId } = useAppParams();
  const router = useRouter();
  const form = useForm<IForm>({
    resolver: zodResolver(validation),
    defaultValues: {
      name: '',
      cors: '',
      tab: 'website',
      projectId: props.projectId ?? projectId,
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
      cors: values.tab === 'website' ? values.cors : null,
      projectId: values.projectId,
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
            <Tabs
              defaultValue="website"
              onValueChange={(val) => form.setValue('tab', val)}
              className="h-28"
            >
              <TabsList className="bg-slate-200">
                <TabsTrigger value="website">Website</TabsTrigger>
                <TabsTrigger value="other">Other</TabsTrigger>
              </TabsList>
              <TabsContent value="website">
                <Label>Cors</Label>
                <Input
                  placeholder="https://example.com"
                  error={form.formState.errors.cors?.message}
                  {...form.register('cors')}
                />
              </TabsContent>
              <TabsContent value="other">
                <div className="rounded bg-background p-2 px-3 text-sm">
                  🔑 You will get a secret to use for your API requests.
                </div>
              </TabsContent>
            </Tabs>
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
