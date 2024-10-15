'use client';

import { Combobox } from '@/components/ui/combobox';
import { useDispatch, useSelector } from '@/redux';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useMemo } from 'react';
import { changeCriteria, changePrevious, changeUnit } from '../reportSlice';

export function ReportSettings() {
  const chartType = useSelector((state) => state.report.chartType);
  const previous = useSelector((state) => state.report.previous);
  const criteria = useSelector((state) => state.report.criteria);
  const unit = useSelector((state) => state.report.unit);

  const dispatch = useDispatch();

  const fields = useMemo(() => {
    const fields = [];

    if (chartType !== 'retention') {
      fields.push('previous');
    }

    if (chartType === 'retention') {
      fields.push('criteria');
      fields.push('unit');
    }

    return fields;
  }, [chartType]);

  if (fields.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="mb-2 font-medium">Settings</h3>
      <div className="col rounded-lg border bg-def-100 p-4 gap-2">
        {fields.includes('previous') && (
          <Label className="flex items-center justify-between mb-0">
            <span>Compare to previous period</span>
            <Switch
              checked={previous}
              onCheckedChange={(val) => dispatch(changePrevious(!!val))}
            />
          </Label>
        )}
        {fields.includes('criteria') && (
          <div className="flex items-center justify-between">
            <span>Criteria</span>
            <Combobox
              align="end"
              placeholder="Select criteria"
              value={criteria}
              onChange={(val) => dispatch(changeCriteria(val))}
              items={[
                {
                  label: 'On or After',
                  value: 'on_or_after',
                },
                {
                  label: 'On',
                  value: 'on',
                },
              ]}
            />
          </div>
        )}
        {fields.includes('unit') && (
          <div className="flex items-center justify-between">
            <span>Unit</span>
            <Combobox
              align="end"
              placeholder="Unit"
              value={unit || 'count'}
              onChange={(val) => {
                dispatch(changeUnit(val === 'count' ? undefined : val));
              }}
              items={[
                {
                  label: 'Count',
                  value: 'count',
                },
                {
                  label: '%',
                  value: '%',
                },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
