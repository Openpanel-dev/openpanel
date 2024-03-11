import { api } from '@/app/_trpc/client';
import { InputWithLabel } from '@/components/forms/InputWithLabel';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import { zodResolver } from '@hookform/resolvers/zod';
import { zInviteUser } from '@openpanel/validation';
import { SendIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

type IForm = z.infer<typeof zInviteUser>;

export function InviteUser() {
  const router = useRouter();
  const { organizationId: organizationSlug } = useAppParams();

  const { register, handleSubmit, formState, reset } = useForm<IForm>({
    resolver: zodResolver(zInviteUser),
    defaultValues: {
      organizationSlug,
      email: '',
      role: 'org:member',
    },
  });

  const mutation = api.organization.inviteUser.useMutation({
    onSuccess() {
      toast('User invited!', {
        description: 'The user has been invited to the organization.',
      });
      reset();
      router.refresh();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex items-end gap-4"
    >
      <InputWithLabel
        className="w-full max-w-sm"
        label="Email"
        placeholder="Who do you want to invite?"
        {...register('email')}
      />
      <Button
        icon={SendIcon}
        type="submit"
        disabled={!formState.isDirty}
        loading={mutation.isLoading}
      >
        Invite user
      </Button>
    </form>
  );
}
