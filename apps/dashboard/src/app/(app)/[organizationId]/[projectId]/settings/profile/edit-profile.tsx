'use client';

import { api, handleError } from '@/app/_trpc/client';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { getUserById } from '@openpanel/db';

const validator = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
});

type IForm = z.infer<typeof validator>;
interface EditProfileProps {
  profile: Awaited<ReturnType<typeof getUserById>>;
}
export default function EditProfile({ profile }: EditProfileProps) {
  const router = useRouter();

  const { register, handleSubmit, reset, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      email: profile.email ?? '',
    },
  });

  const mutation = api.user.update.useMutation({
    onSuccess(res) {
      toast('Profile updated', {
        description: 'Your profile has been updated.',
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
          <span className="title">Your profile</span>
          <Button size="sm" type="submit" disabled={!formState.isDirty}>
            Save
          </Button>
        </WidgetHead>
        <WidgetBody className="flex flex-col gap-4">
          <InputWithLabel
            label="First name"
            placeholder="Your first name"
            defaultValue={profile.firstName ?? ''}
            {...register('firstName')}
          />
          <InputWithLabel
            label="Last name"
            placeholder="Your last name"
            defaultValue={profile.lastName ?? ''}
            {...register('lastName')}
          />
          <InputWithLabel
            disabled
            label="Email"
            placeholder="Your email"
            defaultValue={profile.email ?? ''}
            {...register('email')}
          />
        </WidgetBody>
      </Widget>
    </form>
  );
}
