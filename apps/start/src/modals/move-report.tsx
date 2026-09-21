import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { ButtonContainer } from '@/components/button-container';
import { SelectDashboard } from '@/components/dashboards/select-dashboard';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';

type MoveReportProps = {
  reportId: string;
  dashboardId: string;
};

const validator = z.object({
  dashboardId: z.string().min(1, 'Required'),
});

type IForm = z.infer<typeof validator>;

export default function MoveReport({ reportId, dashboardId }: MoveReportProps) {
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
    })
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
                excludeDashboardId={dashboardId}
                onChange={field.onChange}
                projectId={projectId!}
                value={field.value}
              />
            );
          }}
        />
        <ButtonContainer>
          <Button
            onClick={() => popModal()}
            size="default"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!formState.isValid || move.isPending}
            size="default"
            type="submit"
          >
            Move
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
