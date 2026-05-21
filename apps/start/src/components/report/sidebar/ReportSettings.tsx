import { Combobox } from '@/components/ui/combobox';
import { useDispatch, useSelector } from '@/redux';

import { InputEnter } from '@/components/ui/input-enter';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useMemo, useState } from 'react';
import {
  changeCriteria,
  changeFunnelGroup,
  changeFunnelWindow,
  changeMeasuring,
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
  const measuring = useSelector((state) => state.report.measuring);

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
      fields.push('measuring');
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
        {fields.includes('measuring') && (
          <div className="flex items-center justify-between gap-4">
            <span className="whitespace-nowrap font-medium">Measuring</span>
            <Combobox
              align="end"
              placeholder="Conversion Rate"
              value={measuring || 'conversion_rate'}
              onChange={(val) => {
                dispatch(
                  changeMeasuring(
                    val as 'conversion_rate' | 'time_to_convert',
                  ),
                );
              }}
              items={[
                {
                  label: 'Conversion Rate',
                  value: 'conversion_rate',
                },
                {
                  label: 'Time to Convert',
                  value: 'time_to_convert',
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
              placeholder="Default: Profile"
              value={funnelGroup || 'profile_id'}
              onChange={(val) => {
                dispatch(
                  changeFunnelGroup(val === 'profile_id' ? undefined : val),
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
          <FunnelWindowInput
            funnelWindow={funnelWindow}
            onChange={(value) => dispatch(changeFunnelWindow(value))}
          />
        )}
      </div>
    </div>
  );
}

function FunnelWindowInput({
  funnelWindow,
  onChange,
}: {
  funnelWindow: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  // Determine initial unit: if stored value is divisible by 24, show as days
  const getInitialUnit = () => {
    if (!funnelWindow) return 'days';
    return funnelWindow % 24 === 0 ? 'days' : 'hours';
  };

  const [unit, setUnit] = useState<'hours' | 'days'>(getInitialUnit);

  const displayValue = (() => {
    if (!funnelWindow) return '';
    return unit === 'days'
      ? String(funnelWindow / 24)
      : String(funnelWindow);
  })();

  const handleValueChange = (value: string) => {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed) || parsed <= 0) {
      onChange(undefined);
    } else {
      onChange(unit === 'days' ? parsed * 24 : parsed);
    }
  };

  const handleUnitChange = (newUnit: string) => {
    const newUnitTyped = newUnit as 'hours' | 'days';
    if (newUnitTyped === unit) return;
    setUnit(newUnitTyped);
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="whitespace-nowrap font-medium">Funnel Window</span>
      <div className="flex items-center gap-2">
        <InputEnter
          type="number"
          className="w-20"
          value={displayValue}
          placeholder={unit === 'days' ? '1' : '24'}
          onChangeValue={handleValueChange}
        />
        <Combobox
          align="end"
          value={unit}
          onChange={handleUnitChange}
          items={[
            { label: 'hours', value: 'hours' },
            { label: 'days', value: 'days' },
          ]}
        />
      </div>
    </div>
  );
}
