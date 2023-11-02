import { useCallback, useEffect } from 'react';
import { MainLayout } from '@/components/layouts/MainLayout';
import { Chart } from '@/components/report/chart';
import { useReportId } from '@/components/report/hooks/useReportId';
import { ReportChartType } from '@/components/report/ReportChartType';
import { ReportDateRange } from '@/components/report/ReportDateRange';
import { reset, setReport } from '@/components/report/reportSlice';
import { ReportSidebar } from '@/components/report/sidebar/ReportSidebar';
import { useRouterBeforeLeave } from '@/hooks/useRouterBeforeLeave';
import { useDispatch, useSelector } from '@/redux';
import { createServerSideProps } from '@/server/getServerSideProps';
import { api } from '@/utils/api';

export const getServerSideProps = createServerSideProps();

export default function Page() {
  const { reportId } = useReportId();
  const dispatch = useDispatch();
  const report = useSelector((state) => state.report);
  const reportQuery = api.report.get.useQuery(
    { id: String(reportId) },
    {
      enabled: Boolean(reportId),
    }
  );

  // Reset report state before leaving
  useRouterBeforeLeave(
    useCallback(() => {
      dispatch(reset());
    }, [dispatch])
  );

  // Set report if reportId exists
  useEffect(() => {
    if (reportId && reportQuery.data) {
      dispatch(setReport(reportQuery.data));
    }
  }, [reportId, reportQuery.data, dispatch]);

  return (
    <MainLayout className="grid min-h-screen grid-cols-[400px_minmax(0,1fr)] divide-x">
      <div>
        <ReportSidebar />
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-4">
          <ReportDateRange />
          <ReportChartType />
        </div>

        <Chart {...report} editMode />
      </div>
    </MainLayout>
  );
}
