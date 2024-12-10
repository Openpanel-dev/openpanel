'use client';

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { SendIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { InputWithLabel } from '@/components/forms/input-with-label';
import { zRequestResetPassword } from '@openpanel/validation';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validation = zRequestResetPassword;
type IForm = z.infer<typeof validation>;

type Props = {
  email?: string;
};

export default function RequestPasswordReset({ email }: Props) {
  const router = useRouter();
  const form = useForm<IForm>({
    resolver: zodResolver(validation),
    defaultValues: {
      email: email ?? '',
    },
  });
  const mutation = api.auth.requestResetPassword.useMutation({
    onError: handleError,
    onSuccess() {
      toast.success('You should receive an email shortly!');
      popModal();
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    mutation.mutate({
      email: values.email,
    });
  });

  return (
    <ModalContent>
      <ModalHeader title="Request password reset" />
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <InputWithLabel
          label="Email"
          placeholder="Your email address"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />

        <DialogFooter>
          <Button
            type="button"
            variant={'secondary'}
            onClick={() => popModal()}
          >
            Cancel
          </Button>
          <Button type="submit" icon={SendIcon} loading={mutation.isLoading}>
            Continue
          </Button>
        </DialogFooter>
      </form>
    </ModalContent>
  );
}
