import type { IReportDisplay } from '@openpanel/core/modules/report/report.constants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { useCallback, useRef, useState } from 'react';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';

type TileView = IReportDisplay['view'];

/**
 * The chart/table view of a dashboard's tiles. A switch shows at once and is
 * saved behind it, one save per report at a time, so the last choice is the
 * one stored. A member who may not save keeps their choices for the visit.
 */
export function useTileViews({
  dashboardId,
  projectId,
}: {
  dashboardId: string;
  projectId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [unsavedViews, setUnsavedViews] = useState<Record<string, TileView>>(
    {}
  );
  // A report with a save in flight maps to the view to save after it, if any.
  const queuedViews = useRef(new Map<string, TileView | undefined>());
  const canSave = useRef(true);
  const { mutateAsync: saveDisplay } = useMutation(
    trpc.report.updateDisplay.mutationOptions()
  );

  const changeView = useCallback(
    (reportId: string, view: TileView) => {
      const reportsQueryKey = trpc.report.list.queryKey({
        dashboardId,
        projectId,
      });
      const forgetUnsaved = () =>
        setUnsavedViews(({ [reportId]: _saved, ...rest }) => rest);

      async function saveView(next: TileView): Promise<void> {
        try {
          await saveDisplay({ reportId, display: { view: next } });
        } catch (error) {
          queuedViews.current.delete(reportId);
          if (!(error instanceof TRPCClientError)) {
            throw error;
          }
          if (error.data?.code === 'FORBIDDEN') {
            canSave.current = false;
            return;
          }
          handleErrorToastOptions({})(error);
          forgetUnsaved();
          return;
        }
        queryClient.setQueryData(reportsQueryKey, (current) =>
          current?.map((report) =>
            report.id === reportId
              ? { ...report, display: { view: next } }
              : report
          )
        );
        const queued = queuedViews.current.get(reportId);
        if (queued) {
          queuedViews.current.set(reportId, undefined);
          return saveView(queued);
        }
        queuedViews.current.delete(reportId);
        forgetUnsaved();
      }

      setUnsavedViews((current) => ({ ...current, [reportId]: view }));
      if (!canSave.current) {
        return;
      }
      if (queuedViews.current.has(reportId)) {
        queuedViews.current.set(reportId, view);
        return;
      }
      queuedViews.current.set(reportId, undefined);
      saveView(view);
    },
    [trpc, queryClient, saveDisplay, dashboardId, projectId]
  );

  return { unsavedViews, changeView };
}
