'use client';

import { Combobox } from '@/components/ui/combobox';
import { useDispatch, useSelector } from '@/redux';

import { InputEnter } from '@/components/ui/input-enter';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useMemo } from 'react';
import {
  changeCriteria,
  changeFunnelGroup,
  changeFunnelWindow,
  changePrevious,
  changeUnit,
} from '../reportSlice';

export function ReportSettings() {
  const chartType = useSelector((state) => state.report.chartType);
  const previous = useSelector((state) => state.report.previous);
  const criteria = useSelector((state) => state.report.criteria);
  const unit = useSelector((state) => state.report.unit);
  const funnelGroup = useSelector((state) => state.report.funnelGroup);
  const funnelWindow = useSelector((state) => state.report.funnelWindow);

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

    if (chartType === 'funnel' || chartType === 'conversion') {
      fields.push('funnelGroup');
      fields.push('funnelWindow');
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
            <span className="whitespace-nowrap">
              Compare to previous period
            </span>
            <Switch
              checked={previous}
              onCheckedChange={(val) => dispatch(changePrevious(!!val))}
            />
          </Label>
        )}
        {fields.includes('criteria') && (
          <div className="flex items-center justify-between gap-4">
            <span className="whitespace-nowrap font-medium">Criteria</span>
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
          <div className="flex items-center justify-between gap-4">
            <span className="whitespace-nowrap font-medium">Unit</span>
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
        {fields.includes('funnelGroup') && (
          <div className="flex items-center justify-between gap-4">
            <span className="whitespace-nowrap font-medium">Funnel Group</span>
            <Combobox
              align="end"
              placeholder="Default: Session"
              value={funnelGroup || 'session_id'}
              onChange={(val) => {
                dispatch(
                  changeFunnelGroup(val === 'session_id' ? undefined : val),
                );
              }}
              items={[
                {
                  label: 'Session',
                  value: 'session_id',
                },
                {
                  label: 'Profile',
                  value: 'profile_id',
                },
              ]}
            />
          </div>
        )}
        {fields.includes('funnelWindow') && (
          <div className="flex items-center justify-between gap-4">
            <span className="whitespace-nowrap font-medium">Funnel Window</span>
            <InputEnter
              type="number"
              value={funnelWindow ? String(funnelWindow) : ''}
              placeholder="Default: 24h"
              onChangeValue={(value) => {
                const parsed = Number.parseFloat(value);
                if (Number.isNaN(parsed)) {
                  dispatch(changeFunnelWindow(undefined));
                } else {
                  dispatch(changeFunnelWindow(parsed));
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
