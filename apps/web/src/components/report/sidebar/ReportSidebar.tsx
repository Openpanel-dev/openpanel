import { ReportEvents } from "./ReportEvents";
import { ReportBreakdowns } from "./ReportBreakdowns";
import { ReportSave } from "./ReportSave";

export function ReportSidebar() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <ReportEvents />
      <ReportBreakdowns />
      <ReportSave />
    </div>
  );
}
