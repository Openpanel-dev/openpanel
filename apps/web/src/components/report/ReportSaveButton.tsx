import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { pushModal } from '@/modals';
import { useSelector } from '@/redux';
import { api, handleError } from '@/utils/api';
import { SaveIcon } from 'lucide-react';

import { useReportId } from './hooks/useReportId';

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
        disabled={!report.dirty}
        loading={update.isLoading}
        onClick={() => {
          update.mutate({
            reportId,
            report,
          });
        }}
        icon={SaveIcon}
      >
        Update
      </Button>
    );
  } else {
    return (
      <Button
        disabled={!report.dirty}
        onClick={() => {
          pushModal('SaveReport', {
            report,
          });
        }}
        icon={SaveIcon}
      >
        Save
      </Button>
    );
  }
}
