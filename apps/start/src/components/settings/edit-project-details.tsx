import { zodResolver } from '@hookform/resolvers/zod';
import type { IServiceProjectWithClients } from '@openpanel/core';
import { zProject } from '@openpanel/core/modules/project/project.constants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SaveIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import AnimateHeight from '@/components/animate-height';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import { Button } from '@/components/ui/button';
import { CheckboxInput } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';

type Props = { project: IServiceProjectWithClients };

const validator = zProject.pick({
  name: true,
  id: true,
  domain: true,
  cors: true,
  crossDomain: true,
  allowUnsafeRevenueTracking: true,
});
type IForm = z.infer<typeof validator>;

export default function EditProjectDetails({ project }: Props) {
  const [hasDomain, setHasDomain] = useState(project.domain !== null);
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      id: project.id,
      name: project.name,
      domain: project.domain,
      cors: project.cors,
      crossDomain: project.crossDomain,
      allowUnsafeRevenueTracking: project.allowUnsafeRevenueTracking,
    },
  });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(
    trpc.project.update.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success('Project updated');
        queryClient.invalidateQueries(
          trpc.project.list.queryFilter({
            organizationId: project.organizationId,
          })
        );
        queryClient.invalidateQueries(
          trpc.project.getProjectWithClients.queryFilter({
            projectId: project.id,
          })
        );
      },
    })
  );

  const onSubmit = (values: IForm) => {
    if (hasDomain) {
      let error = false;
      if (values.cors.length === 0) {
        form.setError('cors', {
          type: 'required',
          message: 'Please add at least one cors domain',
        });
        error = true;
      }

      if (!values.domain) {
        form.setError('domain', {
          type: 'required',
          message: 'Please add a domain',
        });
        error = true;
      }

      if (error) {
        return;
      }
    }

    mutation.mutate(hasDomain ? values : { ...values, cors: [], domain: null });
  };

  return (
    <Widget className="w-full max-w-screen-md">
      <WidgetHead>
        <span className="title">Details</span>
      </WidgetHead>
      <WidgetBody>
        <form className="col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <InputWithLabel
            label="Name"
            {...form.register('name')}
            defaultValue={project.name}
          />

          <div className="-mb-2 flex items-center justify-between gap-2">
            <Label className="mb-0">Domain</Label>
            <Switch checked={hasDomain} onCheckedChange={setHasDomain} />
          </div>
          <AnimateHeight open={hasDomain}>
            <Input
              placeholder="https://example.com"
              {...form.register('domain')}
              className="mb-4"
              defaultValue={project.domain ?? ''}
              error={form.formState.errors.domain?.message}
            />

            <Controller
              control={form.control}
              name="cors"
              render={({ field }) => (
                <WithLabel
                  error={form.formState.errors.cors?.message}
                  label="Allowed domains"
                >
                  <TagInput
                    {...field}
                    error={form.formState.errors.cors?.message}
                    onChange={(newValue) => {
                      field.onChange(
                        newValue.map((item) => {
                          const trimmed = item.trim();
                          if (
                            trimmed.startsWith('http://') ||
                            trimmed.startsWith('https://') ||
                            trimmed === '*'
                          ) {
                            return trimmed;
                          }
                          return `https://${trimmed}`;
                        })
                      );
                    }}
                    placeholder="Add a domain"
                    renderTag={(tag) =>
                      tag === '*' ? 'Allow all domains' : tag
                    }
                    value={field.value ?? []}
                  />
                </WithLabel>
              )}
            />
            <Controller
              control={form.control}
              name="crossDomain"
              render={({ field }) => {
                return (
                  <WithLabel className="mt-4" label="Cross domain support">
                    <CheckboxInput
                      defaultChecked={field.value}
                      onBlur={field.onBlur}
                      onCheckedChange={field.onChange}
                      ref={field.ref}
                    >
                      <div>Enable cross domain support</div>
                      <div className="font-normal text-muted-foreground">
                        This will let you track users across multiple domains
                      </div>
                    </CheckboxInput>
                  </WithLabel>
                );
              }}
            />
          </AnimateHeight>

          <Controller
            control={form.control}
            name="allowUnsafeRevenueTracking"
            render={({ field }) => {
              return (
                <WithLabel label="Revenue tracking">
                  <CheckboxInput
                    defaultChecked={field.value}
                    onBlur={field.onBlur}
                    onCheckedChange={field.onChange}
                    ref={field.ref}
                  >
                    <div>Allow "unsafe" revenue tracking</div>
                    <div className="font-normal text-muted-foreground">
                      With this enabled, you can track revenue from client code.
                    </div>
                  </CheckboxInput>
                </WithLabel>
              );
            }}
          />

          <Button
            className="self-start"
            icon={SaveIcon}
            loading={mutation.isPending}
            type="submit"
          >
            Save
          </Button>
        </form>
      </WidgetBody>
    </Widget>
  );
}
