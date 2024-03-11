'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckboxInput } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
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

import { api, handleError } from '../../../_trpc/client';

const validation = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  withSecret: z.boolean().optional(),
});

type IForm = z.infer<typeof validation>;

export function CreateClient() {
  const [open, setOpen] = useState(false);
  const { organizationId, projectId } = useAppParams();
  const clients = api.client.list.useQuery({
    organizationId,
  });
  const clientsCount = clients.data?.length;

  useEffect(() => {
    if (clientsCount === 0) {
      setOpen(true);
    }
  }, [clientsCount]);

  const router = useRouter();
  const form = useForm<IForm>({
    resolver: zodResolver(validation),
    defaultValues: {
      withSecret: false,
      name: '',
      domain: '',
    },
  });
  const mutation = api.client.create2.useMutation({
    onError: handleError,
    onSuccess() {
      toast.success('Client created');
      router.refresh();
    },
  });
  const onSubmit: SubmitHandler<IForm> = (values) => {
    mutation.mutate({
      name: values.name,
      domain: values.withSecret ? undefined : values.domain,
      organizationId,
      projectId,
    });
  };

  const watch = useWatch({
    control: form.control,
    name: 'withSecret',
  });

  return (
    <Dialog open={open}>
      {mutation.isSuccess ? (
        <>
          <DialogContent
            className="sm:max-w-[425px]"
            onClose={() => setOpen(false)}
          >
            <DialogHeader>
              <DialogTitle>Success</DialogTitle>
              <DialogDescription>
                {mutation.data.clientSecret
                  ? 'Use your client id and secret with our SDK to send events to us. '
                  : 'Use your client id with our SDK to send events to us. '}
                See our{' '}
                <Link href="https//openpanel.dev/docs" className="underline">
                  documentation
                </Link>
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
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
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </>
      ) : (
        <>
          <DialogContent
            className="sm:max-w-[425px]"
            onClose={() => setOpen(false)}
          >
            <DialogHeader>
              <DialogTitle>Let's connect</DialogTitle>
              <DialogDescription>
                Create a client so you can start send events to us 🚀
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-4"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <div className="grid gap-4 py-4">
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
                      defaultChecked={field.value}
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
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant={'secondary'}
                  onClick={() => setOpen(false)}
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
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}

// <div>
//   <div className="text-lg">
//     Select your framework and we'll generate a client for you.
//   </div>
//   <div className="flex flex-wrap gap-2 mt-8">
//     <FeatureButton
//       name="React"
//       logo="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/2300px-React-icon.svg.png"
//     />
//     <FeatureButton
//       name="React Native"
//       logo="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/2300px-React-icon.svg.png"
//     />
//     <FeatureButton
//       name="Next.js"
//       logo="https://static-00.iconduck.com/assets.00/nextjs-icon-512x512-y563b8iq.png"
//     />
//     <FeatureButton
//       name="Remix"
//       logo="https://www.datocms-assets.com/205/1642515307-square-logo.svg"
//     />
//     <FeatureButton
//       name="Vue"
//       logo="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ0UhQnp6TUPCwAr3ruTEwBDiTN5HLAWaoUD3AJIgtepQ&s"
//     />
//     <FeatureButton
//       name="HTML"
//       logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/HTML5_logo_and_wordmark.svg/240px-HTML5_logo_and_wordmark.svg.png"
//     />
//   </div>
// </div>
