import { useDispatch, useSelector } from '@/redux';
import { chartTypes } from '@/utils/constants';
import { objectToZodEnums } from '@/utils/validation';

import { Combobox } from '../ui/combobox';
import { changeChartType } from './reportSlice';

interface ReportChartTypeProps {
  className?: string;
}
export function ReportChartType({ className }: ReportChartTypeProps) {
  const dispatch = useDispatch();
  const type = useSelector((state) => state.report.chartType);

  return (
    <Combobox
      className={className}
      placeholder="Chart type"
      onChange={(value) => {
        dispatch(changeChartType(value));
      }}
      value={type}
      items={objectToZodEnums(chartTypes).map((key) => ({
        label: chartTypes[key],
        value: key,
      }))}
    />
  );
}
