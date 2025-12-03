import { useDispatch, useSelector } from '@/redux';
import { Tv2Icon } from 'lucide-react';

import { lineTypes } from '@openpanel/constants';
import { objectToZodEnums } from '@openpanel/validation';

import { Combobox } from '../ui/combobox';
import { changeLineType } from './reportSlice';

interface ReportLineTypeProps {
  className?: string;
}
export function ReportLineType({ className }: ReportLineTypeProps) {
  const dispatch = useDispatch();
  const chartType = useSelector((state) => state.report.chartType);
  const type = useSelector((state) => state.report.lineType);

  if (
    chartType !== 'conversion' &&
    chartType !== 'linear' &&
    chartType !== 'area'
  )
    return null;

  return (
    <Combobox
      icon={Tv2Icon}
      className={className}
      placeholder="Line type"
      onChange={(value) => {
        dispatch(changeLineType(value));
      }}
      value={type}
      items={objectToZodEnums(lineTypes).map((key) => ({
        label: lineTypes[key],
        value: key,
      }))}
    />
  );
}
