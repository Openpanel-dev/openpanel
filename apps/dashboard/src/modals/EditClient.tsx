import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import { Button } from '@/components/ui/button';
import { CheckboxInput } from '@/components/ui/checkbox';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { IServiceClient } from '@openpanel/db';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type EditClientProps = IServiceClient;

const validator = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cors: z.string().nullable(),
  crossDomain: z.boolean().optional(),
});

type IForm = z.infer<typeof validator>;

export default function EditClient({
  id,
  name,
  cors,
  crossDomain,
}: EditClientProps) {
  const router = useRouter();
  const { register, handleSubmit, reset, formState, control, setError } =
    useForm<IForm>({
      resolver: zodResolver(validator),
      defaultValues: {
        id,
        name,
        cors,
        crossDomain,
      },
    });

  const mutation = api.client.update.useMutation({
    onError: handleError,
    onSuccess() {
      reset();
      toast('Success', {
        description: 'Client updated.',
      });
      popModal();
      router.refresh();
    },
  });

  return (
    <ModalContent>
      <ModalHeader title="Edit client" />
      <form
        onSubmit={handleSubmit((values) => {
          if (!values.cors) {
            return setError('cors', {
              type: 'required',
              message: 'Please add a domain',
            });
          }

          mutation.mutate(values);
        })}
      >
        <div className="flex flex-col gap-4">
          <InputWithLabel
            label="Name"
            placeholder="Name"
            {...register('name')}
          />

          <Controller
            name="cors"
            control={control}
            render={({ field }) => (
              <WithLabel
                label="Domain(s)"
                error={formState.errors.cors?.message}
              >
                <TagInput
                  {...field}
                  error={formState.errors.cors?.message}
                  placeholder="Add a domain"
                  value={field.value?.split(',') ?? []}
                  renderTag={(tag) => (tag === '*' ? 'Allow all domains' : tag)}
                  onChange={(newValue) => {
                    field.onChange(
                      newValue
                        .map((item) => {
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
                        .join(','),
                    );
                  }}
                />
              </WithLabel>
            )}
          />

          <Controller
            name="crossDomain"
            control={control}
            render={({ field }) => {
              return (
                <CheckboxInput
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
        </div>
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!formState.isDirty}>
            Save
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
