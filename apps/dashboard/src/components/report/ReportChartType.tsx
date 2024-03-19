import { useDispatch, useSelector } from '@/redux';
import { LineChartIcon } from 'lucide-react';

import { chartTypes } from '@openpanel/constants';
import { objectToZodEnums } from '@openpanel/validation';

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
      icon={LineChartIcon}
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
