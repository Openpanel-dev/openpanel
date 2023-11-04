import { useDispatch, useSelector } from '@/redux';
import type { IChartType } from '@/types';
import { chartTypes } from '@/utils/constants';

import { Combobox } from '../ui/combobox';
import { changeChartType } from './reportSlice';

export function ReportChartType() {
  const dispatch = useDispatch();
  const type = useSelector((state) => state.report.chartType);

  return (
    <Combobox
      placeholder="Chart type"
      onChange={(value) => {
        dispatch(changeChartType(value as IChartType));
      }}
      value={type}
      items={Object.entries(chartTypes).map(([key, value]) => ({
        label: value,
        value: key,
      }))}
    />
  );
}
