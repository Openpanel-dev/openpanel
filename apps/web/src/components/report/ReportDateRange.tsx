import { useDispatch, useSelector } from '@/redux';
import { timeRanges } from '@/utils/constants';

import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { changeDateRanges } from './reportSlice';

export function ReportDateRange() {
  const dispatch = useDispatch();
  const range = useSelector((state) => state.report.range);

  return (
    <RadioGroup className="overflow-auto">
      {Object.values(timeRanges).map((key) => {
        return (
          <RadioGroupItem
            key={key}
            active={key === range}
            onClick={() => {
              dispatch(changeDateRanges(key));
            }}
          >
            {key}
          </RadioGroupItem>
        );
      })}
    </RadioGroup>
  );
}
