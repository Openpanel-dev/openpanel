import { lineTypes } from '@openpanel/core/modules/report/report.constants';
import { Tv2Icon } from 'lucide-react';
import { Combobox } from '../ui/combobox';
import { changeLineType } from './reportSlice';
import { useDispatch, useSelector } from '@/redux';
import { objectToZodEnums } from '@/utils/object-to-zod-enums';

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
  ) {
    return null;
  }

  return (
    <Combobox
      className={className}
      icon={Tv2Icon}
      items={objectToZodEnums(lineTypes).map((key) => ({
        label: lineTypes[key],
        value: key,
      }))}
      onChange={(value) => {
        dispatch(changeLineType(value));
      }}
      placeholder="Line type"
      value={type}
    />
  );
}
