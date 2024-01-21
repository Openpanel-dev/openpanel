'use client';

import { api, handleError } from '@/app/_trpc/client';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAppParams } from '@/hooks/useAppParams';
import { pushModal } from '@/modals';
import { useDispatch, useSelector } from '@/redux';
import { SaveIcon } from 'lucide-react';
import { useParams } from 'next/navigation';

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
  } else {
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
}
