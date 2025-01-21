import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { zShareOverview } from '@openpanel/validation';

import { Input } from '@/components/ui/input';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validator = zShareOverview;

type IForm = z.infer<typeof validator>;

export default function ShareOverviewModal() {
  const { projectId, organizationId } = useAppParams();
  const router = useRouter();

  const { register, handleSubmit } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      public: true,
      password: '',
      projectId,
      organizationId,
    },
  });

  const mutation = api.share.shareOverview.useMutation({
    onError: handleError,
    onSuccess(res) {
      router.refresh();
      toast('Success', {
        description: `Your overview is now ${
          res.public ? 'public' : 'private'
        }`,
      });
      popModal();
    },
  });

  return (
    <ModalContent className="max-w-md">
      <ModalHeader
        title="Dashboard public availability"
        text="You can choose if you want to add a password to make it a bit more private."
      />
      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <Input
          {...register('password')}
          placeholder="Enter your password"
          size="large"
        />
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isLoading}>
            Make it public
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
