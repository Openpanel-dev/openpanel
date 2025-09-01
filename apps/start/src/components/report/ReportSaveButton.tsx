import { Button } from '@/components/ui/button';
import { handleError } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useDispatch, useSelector } from '@/redux';
import { SaveIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useTRPC } from '@/integrations/trpc/react';
import { useIsFetching, useMutation } from '@tanstack/react-query';

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
  // TODO: fix this
  const reportId = '';
  // const { reportId } = useAppParams<{ reportId: string | undefined }>();
  const dispatch = useDispatch();
  const update = useMutation(
    trpc.report.update.mutationOptions({
      onSuccess() {
        dispatch(resetDirty());
        toast('Success', {
          description: 'Report updated.',
        });
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
