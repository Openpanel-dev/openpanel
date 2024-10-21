'use client';

import { useDispatch, useSelector } from '@/redux';

import { InputEnter } from '@/components/ui/input-enter';
import { changeFormula } from '../reportSlice';

export function ReportFormula() {
  const formula = useSelector((state) => state.report.formula);
  const dispatch = useDispatch();

  return (
    <div>
      <h3 className="mb-2 font-medium">Formula</h3>
      <div className="flex flex-col gap-4">
        <InputEnter
          placeholder="eg: A/B"
          value={formula ?? ''}
          onChangeValue={(value) => {
            dispatch(changeFormula(value));
          }}
        />
      </div>
    </div>
  );
}
