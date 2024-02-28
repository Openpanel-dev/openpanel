'use client';

import { useEffect } from 'react';
import { api, handleError } from '@/app/_trpc/client';
import { Button } from '@/components/ui/button';
import { CheckboxInput } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppParams } from '@/hooks/useAppParams';
import { clipboard } from '@/utils/clipboard';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, SaveIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SubmitHandler } from 'react-hook-form';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validation = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  withSecret: z.boolean().optional(),
  projectId: z.string(),
});

type IForm = z.infer<typeof validation>;

export default function AddClient() {
  const { organizationId, projectId } = useAppParams();
  const router = useRouter();
  const form = useForm<IForm>({
    resolver: zodResolver(validation),
    defaultValues: {
      withSecret: false,
      name: '',
      domain: '',
      projectId,
    },
  });
  const mutation = api.client.create2.useMutation({
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
      domain: values.withSecret ? undefined : values.domain,
      projectId: values.projectId,
      organizationId,
    });
  };

  const watch = useWatch({
    control: form.control,
    name: 'withSecret',
  });

  return (
    <ModalContent>
      {mutation.isSuccess ? (
        <>
          <ModalHeader
            title="Success"
            text={
              <>
                {mutation.data.clientSecret
                  ? 'Use your client id and secret with our SDK to send events to us. '
                  : 'Use your client id with our SDK to send events to us. '}
                See our{' '}
                <Link href="https//openpanel.dev/docs" className="underline">
                  documentation
                </Link>
              </>
            }
          />
          <div className="grid gap-4">
            <button
              className="mt-4 text-left"
              onClick={() => clipboard(mutation.data.clientId)}
            >
              <Label>Client ID</Label>
              <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
                {mutation.data.clientId}
                <Copy size={16} />
              </div>
            </button>
            {mutation.data.clientSecret ? (
              <button
                className="mt-4 text-left"
                onClick={() => clipboard(mutation.data.clientId)}
              >
                <Label>Secret</Label>
                <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
                  {mutation.data.clientSecret}
                  <Copy size={16} />
                </div>
              </button>
            ) : (
              <div className="mt-4 text-left">
                <Label>Cors settings</Label>
                <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
                  {mutation.data.cors}
                </div>
                <div className="text-sm italic mt-1">
                  You can update cors settings{' '}
                  <Link className="underline" href="/qwe/qwe/">
                    here
                  </Link>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant={'secondary'}
              onClick={() => popModal()}
            >
              Close
            </Button>
          </DialogFooter>
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
            <Controller
              name="withSecret"
              control={form.control}
              render={({ field }) => (
                <CheckboxInput
                  defaultChecked={!field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(!checked);
                  }}
                >
                  This is a website
                </CheckboxInput>
              )}
            />
            <div>
              <Label>Your domain name</Label>
              <Input
                placeholder="https://...."
                error={form.formState.errors.domain?.message}
                {...form.register('domain')}
                disabled={watch}
              />
            </div>
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
