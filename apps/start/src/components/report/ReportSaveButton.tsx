import {
  useIsFetching,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { SaveIcon } from 'lucide-react';
import { toast } from 'sonner';
import { resetDirty } from './reportSlice';
import { Button } from '@/components/ui/button';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useDispatch, useSelector } from '@/redux';

interface ReportSaveButtonProps {
  className?: string;
}
export function ReportSaveButton({ className }: ReportSaveButtonProps) {
  const trpc = useTRPC();
  const fetching = [
    useIsFetching(trpc.chart.chart.pathFilter()),
    useIsFetching(trpc.chart.cohort.pathFilter()),
  ];
  const { reportId } = useParams({ strict: false });
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const update = useMutation(
    trpc.report.update.mutationOptions({
      onSuccess(res) {
        dispatch(resetDirty());
        toast('Success', {
          description: 'Report updated.',
        });
        queryClient.invalidateQueries(
          trpc.report.list.queryFilter({
            dashboardId: res.dashboardId,
            projectId: res.projectId,
          })
        );
      },
      onError: handleError,
    })
  );
  const report = useSelector((state) => state.report);
  const isLoading = update.isPending || fetching.some((f) => f !== 0);

  if (reportId) {
    return (
      <Button
        className={className}
        disabled={!report.dirty}
        icon={SaveIcon}
        loading={update.isPending || isLoading}
        onClick={() => {
          update.mutate({
            reportId,
            report,
          });
        }}
      >
        Update
      </Button>
    );
  }
  return (
    <Button
      className={className}
      disabled={!report.dirty}
      icon={SaveIcon}
      loading={isLoading}
      onClick={() => {
        pushModal('SaveReport', {
          report,
        });
      }}
    >
      Save
    </Button>
  );
}
