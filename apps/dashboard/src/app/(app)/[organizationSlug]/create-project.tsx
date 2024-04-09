'use client';

import { LogoSquare } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { SaveIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { SubmitHandler } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const validation = z.object({
  name: z.string().min(1),
});

type IForm = z.infer<typeof validation>;

export function CreateProject() {
  const params = useAppParams();
  const router = useRouter();
  const form = useForm<IForm>({
    resolver: zodResolver(validation),
  });
  const mutation = api.project.create.useMutation({
    onError: handleError,
    onSuccess() {
      toast.success('Project created');
      router.refresh();
    },
  });
  const onSubmit: SubmitHandler<IForm> = (values) => {
    mutation.mutate({
      name: values.name,
      organizationSlug: params.organizationSlug,
    });
  };

  return (
    <>
      <div>
        <LogoSquare className="mb-8 w-20 md:w-28" />
        <h1 className="text-3xl font-medium">Create your first project</h1>
        <div className="text-lg">
          A project is just a container for your events. You can create as many
          as you want.
        </div>
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <div>
            <Label>Project name</Label>
            <Input
              placeholder="My App"
              size="large"
              error={form.formState.errors.name?.message}
              {...form.register('name')}
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="lg"
              icon={SaveIcon}
              loading={mutation.isLoading}
            >
              Create project
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
