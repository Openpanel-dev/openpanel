'use client';

import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { api, handleError } from '@/trpc/client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { IServiceOrganization } from '@openpanel/db';

const validator = z.object({
  id: z.string().min(2),
  name: z.string().min(2),
});

type IForm = z.infer<typeof validator>;
interface EditOrganizationProps {
  organization: IServiceOrganization;
}
export default function EditOrganization({
  organization,
}: EditOrganizationProps) {
  const router = useRouter();

  const { register, handleSubmit, formState, reset } = useForm<IForm>({
    defaultValues: organization ?? undefined,
  });

  const mutation = api.organization.update.useMutation({
    onSuccess(res) {
      toast('Organization updated', {
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
          <span className="title">Details</span>
        </WidgetHead>
        <WidgetBody className="flex items-end gap-2">
          <InputWithLabel
            className="flex-1"
            label="Name"
            {...register('name')}
            defaultValue={organization?.name}
          />
          <Button size="sm" type="submit" disabled={!formState.isDirty}>
            Save
          </Button>
        </WidgetBody>
      </Widget>
    </form>
  );
}
