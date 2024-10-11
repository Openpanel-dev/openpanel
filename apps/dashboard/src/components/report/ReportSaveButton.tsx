'use client';

import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import { pushModal } from '@/modals';
import { useDispatch, useSelector } from '@/redux';
import { api, handleError } from '@/trpc/client';
import { SaveIcon } from 'lucide-react';
import { toast } from 'sonner';

import { resetDirty } from './reportSlice';

interface ReportSaveButtonProps {
  className?: string;
}
export function ReportSaveButton({ className }: ReportSaveButtonProps) {
  const { reportId } = useAppParams<{ reportId: string | undefined }>();
  const dispatch = useDispatch();
  const update = api.report.update.useMutation({
    onSuccess() {
      dispatch(resetDirty());
      toast('Success', {
        description: 'Report updated.',
      });
    },
    onError: handleError,
  });
  const report = useSelector((state) => state.report);

  if (reportId) {
    return (
      <Button
        className={className}
        disabled={!report.dirty}
        loading={update.isLoading}
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
    >
      Save
    </Button>
  );
}
