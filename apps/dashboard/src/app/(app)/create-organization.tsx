'use client';

import { LogoSquare } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { zodResolver } from '@hookform/resolvers/zod';
import { SaveIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { SubmitHandler } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { api, handleError } from '../_trpc/client';

const validation = z.object({
  organization: z.string().min(4),
  project: z.string().optional(),
});

type IForm = z.infer<typeof validation>;

export function CreateOrganization() {
  const router = useRouter();
  const form = useForm<IForm>({
    resolver: zodResolver(validation),
  });
  const mutation = api.onboarding.organziation.useMutation({
    onError: handleError,
    onSuccess({ organization, project }) {
      let url = `/${organization.slug}`;
      if (project) {
        url += `/${project.id}`;
      }
      router.replace(url);
    },
  });
  const onSubmit: SubmitHandler<IForm> = (values) => {
    mutation.mutate(values);
  };
  return (
    <>
      <div>
        <LogoSquare className="w-20 md:w-28 mb-8" />
        <h1 className="font-medium text-3xl">Welcome to Openpanel</h1>
        <div className="text-lg">
          Create your organization below (can be personal or a company) and
          optionally your first project 🤠
        </div>
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <div>
            <Label>Organization name *</Label>
            <Input
              placeholder="Organization name"
              size="large"
              error={form.formState.errors.organization?.message}
              {...form.register('organization')}
            />
          </div>
          <div>
            <Label>Project name</Label>
            <Input
              placeholder="Project name"
              size="large"
              error={form.formState.errors.project?.message}
              {...form.register('project')}
            />
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
    </>
  );
}
