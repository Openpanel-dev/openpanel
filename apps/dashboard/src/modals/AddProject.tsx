'use client';

import AnimateHeight from '@/components/animate-height';
import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import { Button } from '@/components/ui/button';
import { CheckboxInput } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import type { IServiceProjectWithClients } from '@openpanel/db';
import { zProject } from '@openpanel/validation';
import { SaveIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ModalContent, ModalHeader } from './Modal/Container';

type Props = { project: IServiceProjectWithClients };

const validator = zProject.pick({
  name: true,
  domain: true,
  cors: true,
  crossDomain: true,
});
type IForm = z.infer<typeof validator>;

export default function AddProject() {
  const { organizationId } = useAppParams();
  const [hasDomain, setHasDomain] = useState(true);
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: '',
      domain: '',
      cors: [],
      crossDomain: false,
    },
  });
  const mutation = api.project.create.useMutation({
    onError: handleError,
    onSuccess: () => {
      toast.success('Project created');
    },
  });

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

    mutation.mutate({
      ...(hasDomain ? values : { ...values, cors: [], domain: null }),
      organizationId,
    });
  };

  return (
    <ModalContent>
      <ModalHeader title="Create project" />
      <form onSubmit={form.handleSubmit(onSubmit)} className="col gap-4">
        <InputWithLabel label="Name" {...form.register('name')} />

        <div className="-mb-2 flex gap-2 items-center justify-between">
          <Label className="mb-0">Domain</Label>
          <Switch checked={hasDomain} onCheckedChange={setHasDomain} />
        </div>
        <AnimateHeight open={hasDomain}>
          <Input
            placeholder="Domain"
            {...form.register('domain')}
            className="mb-4"
            error={form.formState.errors.domain?.message}
          />

          <Controller
            name="cors"
            control={form.control}
            render={({ field }) => (
              <WithLabel label="Cors">
                <TagInput
                  {...field}
                  id="Cors"
                  error={form.formState.errors.cors?.message}
                  placeholder="Add a domain"
                  value={field.value ?? []}
                  renderTag={(tag) => (tag === '*' ? 'Allow all domains' : tag)}
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
                      }),
                    );
                  }}
                />
              </WithLabel>
            )}
          />
          <Controller
            name="crossDomain"
            control={form.control}
            render={({ field }) => {
              return (
                <CheckboxInput
                  className="mt-4"
                  ref={field.ref}
                  onBlur={field.onBlur}
                  defaultChecked={field.value}
                  onCheckedChange={field.onChange}
                >
                  <div>Enable cross domain support</div>
                  <div className="font-normal text-muted-foreground">
                    This will let you track users across multiple domains
                  </div>
                </CheckboxInput>
              );
            }}
          />
        </AnimateHeight>

        <ButtonContainer>
          <Button loading={mutation.isLoading} type="submit" icon={SaveIcon}>
            Save
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
