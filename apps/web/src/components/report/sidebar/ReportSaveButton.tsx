import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { pushModal } from '@/modals';
import { useSelector } from '@/redux';
import { api, handleError } from '@/utils/api';

import { useReportId } from '../hooks/useReportId';

export function ReportSaveButton() {
  const { reportId } = useReportId();
  const update = api.report.update.useMutation({
    onSuccess() {
      toast({
        title: 'Success',
        description: 'Report updated.',
      });
    },
    onError: handleError,
  });
  const report = useSelector((state) => state.report);

  if (reportId) {
    return (
      <Button
        loading={update.isLoading}
        onClick={() => {
          update.mutate({
            reportId,
            report,
            dashboardId: '9227feb4-ad59-40f3-b887-3501685733dd',
            projectId: 'f7eabf0c-e0b0-4ac0-940f-1589715b0c3d',
          });
        }}
      >
        Update
      </Button>
    );
  } else {
    return (
      <Button
        onClick={() => {
          pushModal('SaveReport', {
            report,
          });
        }}
      >
        Create
      </Button>
    );
  }
}
