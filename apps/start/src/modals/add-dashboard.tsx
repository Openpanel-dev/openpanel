import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { handleError } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validator = z.object({
  name: z.string().min(1, 'Required'),
});

type IForm = z.infer<typeof validator>;

export default function AddDashboard() {
  const { t } = useTranslation();
  const { projectId, organizationId } = useAppParams();
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: '',
    },
  });

  const mutation = useMutation(
    trpc.dashboard.create.mutationOptions({
      onSuccess(res) {
        router.navigate({
          to: '/$organizationId/$projectId/dashboards/$dashboardId',
          params: {
            organizationId,
            projectId,
            dashboardId: res.id,
          },
        });
        toast(t('common.success'), {
          description: t('dashboards.toast_created'),
        });
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        popModal();
      },
      onError: handleError,
    }),
  );

  return (
    <ModalContent>
      <ModalHeader title={t('dashboards.add_dashboard')} />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(({ name }) => {
          mutation.mutate({
            name,
            projectId,
          });
        })}
      >
        <InputWithLabel
          label={t('common.name')}
          placeholder={t('dashboards.name_placeholder')}
          {...register('name')}
        />
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!formState.isDirty}>
            {t('common.create')}
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
