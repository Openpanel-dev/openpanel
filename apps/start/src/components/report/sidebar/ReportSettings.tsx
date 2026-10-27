import type {
  IChartMetric,
  IConversionYAxisScale,
} from '@openpanel/core/modules/report/report.constants';
import { conversionYAxisScales } from '@openpanel/core/modules/report/report.constants';
import { useMemo } from 'react';
import {
  changeConversionYAxisScale,
  changeCriteria,
  changeFunnelGroup,
  changeFunnelWindow,
  changeMetric,
  changePrevious,
  changeSankeyExclude,
  changeSankeyInclude,
  changeSankeyMode,
  changeSankeySteps,
  changeStacked,
  changeUnit,
} from '../reportSlice';
import { SidebarSection } from './sidebar-section';
import { Combobox } from '@/components/ui/combobox';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { InputEnter } from '@/components/ui/input-enter';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventNames } from '@/hooks/use-event-names';
import { useDispatch, useSelector } from '@/redux';
import { objectToZodEnums } from '@/utils/object-to-zod-enums';

const DEFAULT_CONVERSION_Y_AXIS_SCALE: IConversionYAxisScale = 'fixed';

export function ReportSettings() {
  const chartType = useSelector((state) => state.report.chartType);
  const previous = useSelector((state) => state.report.previous);
  const unit = useSelector((state) => state.report.unit);
  const metric = useSelector((state) => state.report.metric);
  const options = useSelector((state) => state.report.options);

  const retentionOptions = options?.type === 'retention' ? options : undefined;
  const criteria = retentionOptions?.criteria ?? 'on_or_after';

  const funnelOptions = options?.type === 'funnel' ? options : undefined;
  const funnelGroup = funnelOptions?.funnelGroup;
  const funnelWindow = funnelOptions?.funnelWindow;
  const conversionYAxisScale =
    funnelOptions?.yAxisScale ?? DEFAULT_CONVERSION_Y_AXIS_SCALE;

  const histogramOptions = options?.type === 'histogram' ? options : undefined;
  const stacked = histogramOptions?.stacked ?? false;

  const dispatch = useDispatch();
  const { projectId } = useAppParams();
  const eventNames = useEventNames({ projectId });

  const fields = useMemo(() => {
    const fields: string[] = [];

    if (
      chartType !== 'retention' &&
      chartType !== 'sankey' &&
      chartType !== 'distribution'
    ) {
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

    if (chartType === 'conversion') {
      fields.push('conversionYAxisScale');
    }

    if (chartType === 'sankey') {
      fields.push('sankeyMode');
      fields.push('sankeySteps');
      fields.push('sankeyExclude');
      fields.push('sankeyInclude');
    }

    if (chartType === 'histogram') {
      fields.push('stacked');
    }

    // `map` already reads report.metric; it just never had a way to set it.
    if (chartType === 'metric' || chartType === 'map') {
      fields.push('metric');
    }

    return fields;
  }, [chartType]);

  if (fields.length === 0) {
    return null;
  }

  return (
    <SidebarSection title="Settings">
      <div className="flex flex-col gap-3">
        {fields.includes('previous') && (
          <Label className="mb-0 flex items-center justify-between">
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
            <Label className="mb-0 whitespace-nowrap font-medium">
              Criteria
            </Label>
            <Combobox
              align="end"
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
              onChange={(val) => dispatch(changeCriteria(val))}
              placeholder="Select criteria"
              size="sm"
              value={criteria}
              variant="input"
            />
          </div>
        )}
        {fields.includes('unit') && (
          <div className="flex items-center justify-between gap-4">
            <Label className="mb-0 whitespace-nowrap font-medium">Unit</Label>
            <Combobox
              align="end"
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
              onChange={(val) => {
                dispatch(changeUnit(val === 'count' ? undefined : val));
              }}
              placeholder="Unit"
              size="sm"
              value={unit || 'count'}
              variant="input"
            />
          </div>
        )}
        {fields.includes('metric') && (
          <div className="flex items-center justify-between gap-4">
            <Label className="mb-0 whitespace-nowrap font-medium">
              Aggregation
            </Label>
            <Combobox
              align="end"
              items={[
                { label: 'Unique', value: 'count' },
                { label: 'Sum', value: 'sum' },
                { label: 'Average', value: 'average' },
                { label: 'Min', value: 'min' },
                { label: 'Max', value: 'max' },
              ]}
              onChange={(val) => dispatch(changeMetric(val as IChartMetric))}
              placeholder="Aggregation"
              size="sm"
              value={metric}
              // Same labels the report table uses for these columns.
              variant="input"
            />
          </div>
        )}
        {fields.includes('funnelGroup') && (
          <div className="flex items-center justify-between gap-4">
            <Label className="mb-0 whitespace-nowrap font-medium">
              Funnel Group
            </Label>
            <Combobox
              align="end"
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
              onChange={(val) => {
                dispatch(
                  changeFunnelGroup(val === 'session_id' ? undefined : val)
                );
              }}
              placeholder="Default: Session"
              size="sm"
              value={funnelGroup || 'session_id'}
              variant="input"
            />
          </div>
        )}
        {fields.includes('funnelWindow') && (
          <div className="flex items-center justify-between gap-4">
            <Label className="mb-0 whitespace-nowrap font-medium">
              Funnel Window
            </Label>
            <InputEnter
              className="w-36"
              onChangeValue={(value) => {
                const parsed = Number.parseFloat(value);
                if (Number.isNaN(parsed)) {
                  dispatch(changeFunnelWindow(undefined));
                } else {
                  dispatch(changeFunnelWindow(parsed));
                }
              }}
              placeholder="Default: 24h"
              size="sm"
              type="number"
              value={funnelWindow ? String(funnelWindow) : ''}
            />
          </div>
        )}
        {fields.includes('conversionYAxisScale') && (
          <div className="flex items-center justify-between gap-4">
            <Label className="mb-0 whitespace-nowrap font-medium">Y axis</Label>
            <Combobox
              align="end"
              items={objectToZodEnums(conversionYAxisScales).map((key) => ({
                label: conversionYAxisScales[key],
                value: key,
              }))}
              onChange={(val) => {
                dispatch(
                  changeConversionYAxisScale(
                    val === DEFAULT_CONVERSION_Y_AXIS_SCALE ? undefined : val
                  )
                );
              }}
              placeholder="Default: Fixed"
              size="sm"
              value={conversionYAxisScale}
              variant="input"
            />
          </div>
        )}
        {fields.includes('sankeyMode') && options?.type === 'sankey' && (
          <div className="flex items-center justify-between gap-4">
            <Label className="mb-0 whitespace-nowrap font-medium">Mode</Label>
            <Combobox
              align="end"
              items={[
                {
                  label: 'After',
                  value: 'after',
                },
                {
                  label: 'Before',
                  value: 'before',
                },
                {
                  label: 'Between',
                  value: 'between',
                },
              ]}
              onChange={(val) => {
                dispatch(
                  changeSankeyMode(val as 'between' | 'after' | 'before')
                );
              }}
              placeholder="Select mode"
              size="sm"
              value={options?.mode || 'after'}
              variant="input"
            />
          </div>
        )}
        {fields.includes('sankeySteps') && options?.type === 'sankey' && (
          <div className="flex items-center justify-between gap-4">
            <Label className="mb-0 whitespace-nowrap font-medium">Steps</Label>
            <InputEnter
              className="w-36"
              onChangeValue={(value) => {
                const parsed = Number.parseInt(value, 10);
                if (Number.isNaN(parsed) || parsed < 2 || parsed > 10) {
                  dispatch(changeSankeySteps(5));
                } else {
                  dispatch(changeSankeySteps(parsed));
                }
              }}
              placeholder="Default: 5"
              size="sm"
              type="number"
              value={options?.steps ? String(options.steps) : '5'}
            />
          </div>
        )}
        {fields.includes('sankeyExclude') && options?.type === 'sankey' && (
          <div className="flex flex-col">
            <Label className="whitespace-nowrap font-medium">
              Exclude Events
            </Label>
            <ComboboxEvents
              items={eventNames.filter((item) => item.name !== '*')}
              multiple
              onChange={(value) => {
                dispatch(changeSankeyExclude(value));
              }}
              placeholder="Select events to exclude"
              searchable
              value={options?.exclude || []}
              variant="input"
            />
          </div>
        )}
        {fields.includes('sankeyInclude') && options?.type === 'sankey' && (
          <div className="flex flex-col">
            <Label className="whitespace-nowrap font-medium">
              Include events
            </Label>
            <ComboboxEvents
              items={eventNames.filter((item) => item.name !== '*')}
              multiple
              onChange={(value) => {
                dispatch(
                  changeSankeyInclude(value.length > 0 ? value : undefined)
                );
              }}
              placeholder="Leave empty to include all"
              searchable
              value={options?.include || []}
              variant="input"
            />
          </div>
        )}
        {fields.includes('stacked') && (
          <Label className="mb-0 flex items-center justify-between">
            <span className="whitespace-nowrap">Stack series</span>
            <Switch
              checked={stacked}
              onCheckedChange={(val) => dispatch(changeStacked(!!val))}
            />
          </Label>
        )}
      </div>
    </SidebarSection>
  );
}
