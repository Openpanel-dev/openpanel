'use client';

import { useState } from 'react';
import AnimateHeight from '@/components/animate-height';
import { CreateClientSuccess } from '@/components/clients/create-client-success';
import { LogoSquare } from '@/components/logo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, handleError } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { zodResolver } from '@hookform/resolvers/zod';
import { SaveIcon, WallpaperIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { SubmitHandler } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const validation = z.object({
  organization: z.string().min(3),
  project: z.string().min(3),
  cors: z.string().url().or(z.literal('')),
});

type IForm = z.infer<typeof validation>;

export function CreateOrganization() {
  const router = useRouter();
  const [hasDomain, setHasDomain] = useState(true);
  const form = useForm<IForm>({
    resolver: zodResolver(validation),
    defaultValues: {
      organization: '',
      project: '',
      cors: '',
    },
  });
  const mutation = api.onboarding.organziation.useMutation({
    onError: handleError,
  });
  const onSubmit: SubmitHandler<IForm> = (values) => {
    mutation.mutate({
      ...values,
      cors: hasDomain ? values.cors : null,
    });
  };

  if (mutation.isSuccess && mutation.data.client) {
    return (
      <div className="card p-4 md:p-8">
        <LogoSquare className="mb-4 w-20" />
        <h1 className="text-3xl font-medium">Nice job!</h1>
        <div className="mb-4">
          You&apos;re ready to start using our SDK. Save the client ID and
          secret (if you have any)
        </div>
        <CreateClientSuccess {...mutation.data.client} />
        <div className="mt-4 flex gap-4">
          <a
            className={cn(buttonVariants({ variant: 'secondary' }), 'flex-1')}
            href="https://docs.openpanel.dev/docs"
            target="_blank"
          >
            Read docs
          </a>
          <Button
            className="flex-1"
            onClick={() => router.refresh()}
            icon={WallpaperIcon}
          >
            Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4 md:p-8">
      <LogoSquare className="mb-4 w-20" />
      <h1 className="text-3xl font-medium">Welcome to Openpanel</h1>
      <div className="text-lg">
        Create your organization below (can be personal or a company) and your
        first project.
      </div>
      <Alert className="mt-8">
        <AlertTitle>Free during beta</AlertTitle>
        <AlertDescription>
          Openpanel is free during beta. Check our{' '}
          <a
            href="https://openpanel.dev/#pricing"
            target="_blank"
            className="text-blue-600 underline"
          >
            pricing
          </a>{' '}
          if you&apos;re curious. We&apos;ll also have a free tier.
        </AlertDescription>
      </Alert>
      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div>
          <Label>Organization name *</Label>
          <Input
            placeholder="Organization name"
            error={form.formState.errors.organization?.message}
            {...form.register('organization')}
          />
        </div>
        <div>
          <Label>Project name *</Label>
          <Input
            placeholder="Project name"
            error={form.formState.errors.project?.message}
            {...form.register('project')}
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

        <div className="flex justify-end">
          <Button
            type="submit"
            size="lg"
            icon={SaveIcon}
            loading={mutation.isLoading}
          >
            Create
          </Button>
        </div>
      </form>
    </div>
  );
}
