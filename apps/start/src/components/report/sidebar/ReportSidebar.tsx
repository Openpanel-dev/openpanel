import { ReportChartType } from '@/components/report/ReportChartType';
import { changeChartType } from '@/components/report/reportSlice';
import { Button } from '@/components/ui/button';
import { SheetClose, SheetFooter } from '@/components/ui/sheet';
import { useDispatch, useSelector } from '@/redux';

import { ReportBreakdowns } from './ReportBreakdowns';
import { ReportGlobalFilters } from './ReportGlobalFilters';
import { ReportHoldProperties } from './ReportHoldProperties';
import { ReportSeries } from './ReportSeries';
import { ReportSettings } from './ReportSettings';

export function ReportSidebar() {
  const dispatch = useDispatch();
  const { chartType } = useSelector((state) => state.report);
  const showBreakdown = chartType !== 'retention';
  return (
    <>
      <div className="flex flex-col gap-8">
        <div>
          <h3 className="mb-2 font-medium">Chart type</h3>
          <ReportChartType
            className="w-full"
            value={chartType}
            onChange={(type) => dispatch(changeChartType(type))}
          />
        </div>
        <ReportSeries />
        <ReportGlobalFilters />
        {(chartType === 'funnel' || chartType === 'conversion') && <ReportHoldProperties />}
        {showBreakdown && <ReportBreakdowns />}
        <ReportSettings />
      </div>
      <SheetFooter>
        <SheetClose asChild>
          <Button className="w-full">Done</Button>
        </SheetClose>
      </SheetFooter>
    </>
  );
}
