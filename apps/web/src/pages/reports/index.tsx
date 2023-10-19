import { ReportSidebar } from "@/components/report/sidebar/ReportSidebar";
import { ReportLineChart } from "@/components/report/chart/ReportLineChart";
import { useDispatch, useSelector } from "@/redux";
import { MainLayout } from "@/components/layouts/Main";
import { ReportDateRange } from "@/components/report/ReportDateRange";
import { useCallback, useEffect } from "react";
import { reset, setReport } from "@/components/report/reportSlice";
import { useReportId } from "@/components/report/hooks/useReportId";
import { api } from "@/utils/api";
import { useRouterBeforeLeave } from "@/hooks/useRouterBeforeLeave";

export default function Page() {
  const { reportId } = useReportId();
  const dispatch = useDispatch();
  const report = useSelector((state) => state.report);
  const reportQuery = api.report.get.useQuery({ id: String(reportId) }, {
    enabled: Boolean(reportId),
  })

  // Reset report state before leaving
  useRouterBeforeLeave(useCallback(() => {
    dispatch(reset())
  }, [dispatch]))

  // Set report if reportId exists
  useEffect(() => {
    if(reportId && reportQuery.data) {
      dispatch(setReport(reportQuery.data))
    }
  }, [reportId, reportQuery.data, dispatch])

  return (
    <MainLayout className="grid min-h-screen grid-cols-[400px_minmax(0,1fr)] divide-x">
      <div>
        <ReportSidebar />
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-4">
          <ReportDateRange />
        </div>

        <ReportLineChart {...report} showTable />
      </div>
    </MainLayout>
  );
}
