'use client';

import { api, handleError } from '@/app/_trpc/client';
import { InputWithLabel } from '@/components/forms/InputWithLabel';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Widget, WidgetBody, WidgetHead } from '@/components/Widget';
import type { getOrganizationBySlug } from '@/server/services/organization.service';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const validator = z.object({
  id: z.string().min(2),
  name: z.string().min(2),
});

type IForm = z.infer<typeof validator>;
interface EditOrganizationProps {
  organization: Awaited<ReturnType<typeof getOrganizationBySlug>>;
}
export default function EditOrganization({
  organization,
}: EditOrganizationProps) {
  const router = useRouter();

  const { register, handleSubmit, formState, reset } = useForm<IForm>({
    defaultValues: organization,
  });

  const mutation = api.organization.update.useMutation({
    onSuccess(res) {
      toast({
        title: 'Organization updated',
        description: 'Your organization has been updated.',
      });
      reset(res);
      router.refresh();
    },
    onError: handleError,
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        mutation.mutate(values);
      })}
    >
      <Widget>
        <WidgetHead className="flex items-center justify-between">
          <span className="title">Org. details</span>
          <Button size="sm" type="submit" disabled={!formState.isDirty}>
            Save
          </Button>
        </WidgetHead>
        <WidgetBody>
          <InputWithLabel
            label="Name"
            {...register('name')}
            defaultValue={organization.name}
          />
        </WidgetBody>
      </Widget>
    </form>
  );
}
