'use client';

import { Input } from '@/components/ui/input';
import { useDispatch, useSelector } from '@/redux';

import { changeFormula } from '../reportSlice';

export function ReportForumula() {
  const forumula = useSelector((state) => state.report.formula);
  const dispatch = useDispatch();

  return (
    <div>
      <h3 className="mb-2 font-medium">Forumula</h3>
      <div className="flex flex-col gap-4">
        <Input
          placeholder="eg: A/B"
          value={forumula}
          onChange={(event) => {
            dispatch(changeFormula(event.target.value));
          }}
        />
      </div>
    </div>
  );
}
