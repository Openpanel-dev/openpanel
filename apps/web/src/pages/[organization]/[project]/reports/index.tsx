import { useCallback, useEffect } from 'react';
import { Container } from '@/components/Container';
import { MainLayout } from '@/components/layouts/MainLayout';
import { Chart } from '@/components/report/chart';
import { useReportId } from '@/components/report/hooks/useReportId';
import { ReportChartType } from '@/components/report/ReportChartType';
import { ReportDateRange } from '@/components/report/ReportDateRange';
import { ReportInterval } from '@/components/report/ReportInterval';
import { ReportSaveButton } from '@/components/report/ReportSaveButton';
import { reset, setReport } from '@/components/report/reportSlice';
import { ReportSidebar } from '@/components/report/sidebar/ReportSidebar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
    <Sheet>
      <MainLayout>
        <Container>
          <div className="flex flex-col gap-4 mt-8">
            <div className="flex flex-col gap-4">
              <ReportDateRange />
              <div className="flex flex-col sm:flex-row gap-4 justify-between">
                <div className="flex gap-4">
                  <ReportChartType />
                  <ReportInterval />
                </div>
                <div className="flex gap-4">
                  <SheetTrigger asChild>
                    <Button size="default">Select events & Filters</Button>
                  </SheetTrigger>
                  <ReportSaveButton />
                </div>
              </div>
            </div>
            <Chart {...report} editMode />
          </div>
        </Container>
      </MainLayout>
      <SheetContent className="!max-w-lg w-full">
        <ReportSidebar />
      </SheetContent>
    </Sheet>
  );
}
