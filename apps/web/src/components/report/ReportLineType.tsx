import { useDispatch, useSelector } from '@/redux';
import { lineTypes } from '@/utils/constants';
import { objectToZodEnums } from '@/utils/validation';

import { Combobox } from '../ui/combobox';
import { changeLineType } from './reportSlice';

interface ReportLineTypeProps {
  className?: string;
}
export function ReportLineType({ className }: ReportLineTypeProps) {
  const dispatch = useDispatch();
  const chartType = useSelector((state) => state.report.chartType);
  const type = useSelector((state) => state.report.lineType);

  if (chartType != 'linear' && chartType != 'area') {
    return null;
  }

  return (
    <Combobox
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
