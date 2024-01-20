'use client';

import { api, handleError } from '@/app/_trpc/client';
import { ContentHeader, ContentSection } from '@/components/Content';
import { InputError } from '@/components/forms/InputError';
import { InputWithLabel } from '@/components/forms/InputWithLabel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { Widget, WidgetBody, WidgetHead } from '@/components/Widget';
import type { getOrganizationById } from '@/server/services/organization.service';
import type { getProfileById } from '@/server/services/profile.service';
import type { getUserById } from '@/server/services/user.service';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const validator = z.object({
  name: z.string().min(2),
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
      name: profile.name ?? '',
      email: profile.email ?? '',
    },
  });

  const mutation = api.user.update.useMutation({
    onSuccess(res) {
      toast({
        title: 'Profile updated',
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
            label="Name"
            placeholder="Your name"
            defaultValue={profile.name ?? ''}
            {...register('name')}
          />
          <InputWithLabel
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
