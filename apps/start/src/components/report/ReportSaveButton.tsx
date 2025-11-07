import { Button } from '@/components/ui/button';
import { handleError } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useDispatch, useSelector } from '@/redux';
import { SaveIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useTRPC } from '@/integrations/trpc/react';
import {
  useIsFetching,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { useParams } from '@tanstack/react-router';
import { resetDirty } from './reportSlice';

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
          }),
        );
      },
      onError: handleError,
    }),
  );
  const report = useSelector((state) => state.report);
  const isLoading = update.isPending || fetching.some((f) => f !== 0);

  if (reportId) {
    return (
      <Button
        className={className}
        disabled={!report.dirty}
        loading={update.isPending || isLoading}
        onClick={() => {
          update.mutate({
            reportId: reportId,
            report,
          });
        }}
        icon={SaveIcon}
      >
        Update
      </Button>
    );
  }
  return (
    <Button
      className={className}
      disabled={!report.dirty}
      onClick={() => {
        pushModal('SaveReport', {
          report,
        });
      }}
      icon={SaveIcon}
      loading={isLoading}
    >
      Save
    </Button>
  );
}
