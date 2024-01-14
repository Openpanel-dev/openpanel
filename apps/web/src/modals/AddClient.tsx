import { ButtonContainer } from '@/components/ButtonContainer';
import { InputWithLabel } from '@/components/forms/InputWithLabel';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { useRefetchActive } from '@/hooks/useRefetchActive';
import { api, handleError } from '@/utils/api';
import { clipboard } from '@/utils/clipboard';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const Syntax = dynamic(import('@/components/Syntax'));

const validator = z.object({
  name: z.string().min(1, 'Required'),
  cors: z.string().min(1, 'Required'),
  withCors: z.boolean(),
  projectId: z.string().min(1, 'Required'),
});

type IForm = z.infer<typeof validator>;

export default function CreateProject() {
  const params = useOrganizationParams();
  const refetch = useRefetchActive();
  const query = api.project.list.useQuery({
    organizationSlug: params.organization,
  });
  const mutation = api.client.create.useMutation({
    onError: handleError,
    onSuccess() {
      toast({
        title: 'Success',
        description: 'Client created!',
      });
      refetch();
    },
  });
  const { register, handleSubmit, formState, control } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: '',
      cors: '*',
      projectId: '',
      withCors: true,
    },
  });

  const withCors = useWatch({
    control,
    name: 'withCors',
  });

  if (mutation.isSuccess && mutation.data) {
    const { clientId, clientSecret, cors } = mutation.data;
    const snippet = clientSecret
      ? `const mixan = new Mixan({
  clientId: "${clientId}",
  // Avoid using this on web, rely on cors settings instead
  // Mostly for react-native and node/backend
  clientSecret: "${clientSecret}",
})`
      : `const mixan = new Mixan({
  clientId: "${clientId}",
})`;
    return (
      <ModalContent>
        <ModalHeader title="Client created 🚀" />
        <p>
          Your client has been created! You will only see the client secret once
          so keep it safe 🫣
        </p>

        <button className="mt-4 text-left" onClick={() => clipboard(cors)}>
          <Label>Cors settings</Label>
          <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
            {cors}
            <Copy size={16} />
          </div>
        </button>
        <button className="mt-4 text-left" onClick={() => clipboard(clientId)}>
          <Label>Client ID</Label>
          <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
            {clientId}
            <Copy size={16} />
          </div>
        </button>
        {clientSecret && (
          <button
            className="mt-4 text-left"
            onClick={() => clipboard(clientSecret)}
          >
            <Label>Client Secret</Label>
            <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
              {clientSecret}
              <Copy size={16} />
            </div>
          </button>
        )}
        <div className="mt-4">
          <Label>Code snippet</Label>
          <div className="[&_pre]:!rounded [&_pre]:!bg-gray-100 [&_pre]:text-sm">
            <Syntax code={snippet} />
          </div>
        </div>

        <ButtonContainer>
          <div />
          <Button onClick={() => popModal()}>Done</Button>
        </ButtonContainer>
      </ModalContent>
    );
  }

  return (
    <ModalContent>
      <ModalHeader title="Create client" />
      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate({
            ...values,
            organizationSlug: params.organization,
          });
        })}
      >
        <InputWithLabel
          label="Name"
          placeholder="Name"
          {...register('name')}
          className="mb-4"
        />

        <Controller
          name="withCors"
          control={control}
          render={({ field }) => (
            <label
              htmlFor="cors"
              className="flex items-center gap-2 text-sm font-medium leading-none mb-4"
            >
              <Checkbox
                id="cors"
                ref={field.ref}
                onBlur={field.onBlur}
                defaultChecked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                }}
              />
              Auth with cors settings
            </label>
          )}
        />
        {withCors && (
          <>
            <InputWithLabel
              label="Cors"
              placeholder="Cors"
              {...register('cors')}
            />
            <div className="text-xs text-muted-foreground mb-4 mt-1">
              Restrict access by domain names (include https://)
            </div>
          </>
        )}
        <Controller
          control={control}
          name="projectId"
          render={({ field }) => {
            return (
              <div>
                <Label>Project</Label>
                <Combobox
                  {...field}
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
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!formState.isDirty}>
            Create
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
