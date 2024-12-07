'use client';

import { WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import type { IServiceProjectWithClients } from '@openpanel/db';
import type {
  IProjectFilterIp,
  IProjectFilterProfileId,
} from '@openpanel/validation';
import { SaveIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

type Props = { project: IServiceProjectWithClients };

const validator = z.object({
  ips: z.array(z.string()),
  profileIds: z.array(z.string()),
});

type IForm = z.infer<typeof validator>;

export default function EditProjectFilters({ project }: Props) {
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      ips: project.filters
        .filter((item): item is IProjectFilterIp => item.type === 'ip')
        .map((item) => item.ip),
      profileIds: project.filters
        .filter(
          (item): item is IProjectFilterProfileId => item.type === 'profile_id',
        )
        .map((item) => item.profileId),
    },
  });
  const mutation = api.project.update.useMutation({
    onError: handleError,
    onSuccess: () => {
      toast.success('Project filters updated');
    },
  });

  const onSubmit = (values: IForm) => {
    mutation.mutate({
      id: project.id,
      filters: [
        ...values.ips.map((ip) => ({ type: 'ip' as const, ip })),
        ...values.profileIds.map((profileId) => ({
          type: 'profile_id' as const,
          profileId,
        })),
      ],
    });
  };

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead className="col gap-2">
        <span className="title">Exclude events</span>
        <p className="text-muted-foreground">
          Exclude events from being tracked by adding filters.
        </p>
      </WidgetHead>
      <WidgetBody>
        <form onSubmit={form.handleSubmit(onSubmit)} className="col gap-4">
          <Controller
            name="ips"
            control={form.control}
            render={({ field }) => (
              <WithLabel label="IP addresses">
                <TagInput
                  {...field}
                  id="IP addresses"
                  error={form.formState.errors.ips?.message}
                  placeholder="Exclude IP addresses"
                  value={field.value}
                  onChange={field.onChange}
                />
              </WithLabel>
            )}
          />

          <Controller
            name="profileIds"
            control={form.control}
            render={({ field }) => (
              <WithLabel label="Profile IDs">
                <TagInput
                  {...field}
                  id="Profile IDs"
                  error={form.formState.errors.profileIds?.message}
                  placeholder="Exclude Profile IDs"
                  value={field.value}
                  onChange={field.onChange}
                />
              </WithLabel>
            )}
          />

          <Button
            loading={mutation.isLoading}
            type="submit"
            icon={SaveIcon}
            className="self-end"
          >
            Save
          </Button>
        </form>
      </WidgetBody>
    </Widget>
  );
}
