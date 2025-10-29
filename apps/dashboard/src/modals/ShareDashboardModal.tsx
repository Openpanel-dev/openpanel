import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { zShareDashboard } from '@openpanel/validation';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type IForm = z.infer<typeof zShareDashboard>;

export default function ShareDashboardModal() {
  const params = useAppParams<{ dashboardId: string }>();
  const { organizationId, dashboardId } = params;
  const router = useRouter();

  const { register, handleSubmit } = useForm<IForm>({
    resolver: zodResolver(zShareDashboard),
    defaultValues: {
      public: true,
      password: '',
      dashboardId,
      organizationId,
    },
  });

  const mutation = api.share.createDashboard.useMutation({
    onError: handleError,
    onSuccess(res) {
      router.refresh();
      toast('Success', {
        description: `Your dashboard is now ${
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
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
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
