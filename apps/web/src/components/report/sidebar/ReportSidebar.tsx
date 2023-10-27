import { ReportEvents } from "./ReportEvents";
import { ReportBreakdowns } from "./ReportBreakdowns";
import { ReportSaveButton } from "./ReportSaveButton";

export function ReportSidebar() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <ReportEvents />
      <ReportBreakdowns />
      <ReportSaveButton />
    </div>
  );
}
