import { Button } from "@/components/ui/button";
import { useReportId } from "../hooks/useReportId";
import { api } from "@/utils/api";
import { useSelector } from "@/redux";
import { pushModal } from "@/modals";

export function ReportSaveButton() {
  const { reportId } = useReportId();
  const update = api.report.update.useMutation();
  const report = useSelector((state) => state.report);

  if (reportId) {
    return <Button onClick={() => {
      update.mutate({
        reportId,
        report,
        dashboardId: "9227feb4-ad59-40f3-b887-3501685733dd",
        projectId: "f7eabf0c-e0b0-4ac0-940f-1589715b0c3d",
      });
    }}>Update</Button>;
  } else {
    return (
      <Button
        onClick={() => {
          pushModal('SaveReport', {
            report,
          })
        }}
      >
        Create
      </Button>
    );
  }
}
