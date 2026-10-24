import { zodResolver } from '@hookform/resolvers/zod';
import { zRequestResetPassword } from '@openpanel/core/modules/auth/auth.constants';
import { useMutation } from '@tanstack/react-query';
import { SendIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useAppContext } from '@/hooks/use-app-context';
import { unwrap, useAuthClient } from '@/integrations/auth/client';

const validation = zRequestResetPassword;
type IForm = z.infer<typeof validation>;

interface Props {
  email?: string;
}

export default function RequestPasswordReset({ email }: Props) {
  const form = useForm<IForm>({
    resolver: zodResolver(validation),
    defaultValues: {
      email: email ?? '',
    },
  });
  const authClient = useAuthClient();
  const { dashboardUrl } = useAppContext();
  const mutation = useMutation({
    mutationFn: ({ email }: IForm) =>
      unwrap(
        authClient.requestPasswordReset({
          email,
          redirectTo: `${dashboardUrl}/reset-password`,
        })
      ),
    onSuccess() {
      toast.success('You should receive an email shortly!');
      popModal();
    },
    onError(error) {
      toast.error(error.message);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    mutation.mutate(values);
  });

  return (
    <ModalContent>
      <ModalHeader title="Request password reset" />
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <InputWithLabel
          error={form.formState.errors.email?.message}
          label="Email"
          placeholder="Your email address"
          {...form.register('email')}
        />

        <DialogFooter>
          <Button
            onClick={() => popModal()}
            type="button"
            variant={'secondary'}
          >
            Cancel
          </Button>
          <Button icon={SendIcon} loading={mutation.isPending} type="submit">
            Continue
          </Button>
        </DialogFooter>
      </form>
    </ModalContent>
  );
}
