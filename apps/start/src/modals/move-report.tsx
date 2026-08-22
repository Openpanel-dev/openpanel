import { ButtonContainer } from '@/components/button-container';
import { SelectDashboard } from '@/components/dashboards/select-dashboard';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type MoveReportProps = {
  reportId: string;
  dashboardId: string;
};

const validator = z.object({
  dashboardId: z.string().min(1, 'Required'),
});

type IForm = z.infer<typeof validator>;

export default function MoveReport({
  reportId,
  dashboardId,
}: MoveReportProps) {
  const queryClient = useQueryClient();
  const { projectId } = useAppParams();

  const trpc = useTRPC();
  const move = useMutation(
    trpc.report.move.mutationOptions({
      onError: handleError,
      onSuccess() {
        queryClient.invalidateQueries(trpc.report.list.pathFilter());
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        toast('Report moved');
        popModal();
      },
    }),
  );

  const { handleSubmit, formState, control } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      dashboardId: '',
    },
  });

  return (
    <ModalContent>
      <ModalHeader title="Move report" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => {
          move.mutate({
            reportId,
            dashboardId: values.dashboardId,
          });
        })}
      >
        <Controller
          control={control}
          name="dashboardId"
          render={({ field }) => {
            return (
              <SelectDashboard
                value={field.value}
                onChange={field.onChange}
                projectId={projectId!}
                excludeDashboardId={dashboardId}
              />
            );
          }}
        />
        <ButtonContainer>
          <Button
            type="button"
            variant="outline"
            onClick={() => popModal()}
            size="default"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!formState.isValid || move.isPending}
            size="default"
          >
            Move
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
