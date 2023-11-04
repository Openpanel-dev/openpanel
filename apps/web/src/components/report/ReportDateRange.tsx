import { useDispatch, useSelector } from '@/redux';
import { timeRanges } from '@/utils/constants';

import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { changeDateRanges } from './reportSlice';

export function ReportDateRange() {
  const dispatch = useDispatch();
  const range = useSelector((state) => state.report.range);

  return (
    <RadioGroup className="overflow-auto">
      {timeRanges.map((item) => {
        return (
          <RadioGroupItem
            key={item.range}
            active={item.range === range}
            onClick={() => {
              dispatch(changeDateRanges(item.range));
            }}
          >
            {item.title}
          </RadioGroupItem>
        );
      })}
    </RadioGroup>
  );
}
