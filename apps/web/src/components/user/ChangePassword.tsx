import { api, handleError } from '@/app/_trpc/client';
import { ContentHeader, ContentSection } from '@/components/Content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { InputError } from '../forms/InputError';

const validator = z
  .object({
    oldPassword: z.string().min(1),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .superRefine(({ confirmPassword, password }, ctx) => {
    if (confirmPassword !== password) {
      ctx.addIssue({
        path: ['confirmPassword'],
        code: 'custom',
        message: 'The passwords did not match',
      });
    }
  });

type IForm = z.infer<typeof validator>;

export function ChangePassword() {
  const mutation = api.user.changePassword.useMutation({
    onSuccess() {
      toast({
        title: 'Success',
        description: 'You have updated your password',
      });
    },
    onError: handleError,
  });

  const { register, handleSubmit, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      oldPassword: '',
      password: '',
      confirmPassword: '',
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        mutation.mutate(values);
      })}
      className="flex flex-col divide-y divide-border"
    >
      <ContentHeader
        title="Change password"
        text="Need to change your password?"
      >
        <Button type="submit" disabled={!formState.isDirty}>
          Change it!
        </Button>
      </ContentHeader>
      <ContentSection
        title="Old password"
        text={<InputError {...formState.errors.oldPassword} />}
      >
        <Input
          type="password"
          {...register('oldPassword')}
          placeholder="Old password"
        />
      </ContentSection>
      <ContentSection
        title="New password"
        text={<InputError {...formState.errors.password} />}
      >
        <Input
          type="password"
          {...register('password')}
          placeholder="New password"
        />
      </ContentSection>
      <ContentSection
        title="Confirm password"
        text={<InputError {...formState.errors.confirmPassword} />}
      >
        <Input
          type="password"
          {...register('confirmPassword')}
          placeholder="Confirm password"
        />
      </ContentSection>
    </form>
  );
}
