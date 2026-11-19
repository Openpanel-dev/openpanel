import {
  alphabetIds,
  type ITimeToConvertAggregation,
  timeToConvertAggregations,
} from '@openpanel/core/modules/report/report.constants';
import { UsersIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { getPreviousMetric } from '../../../utils/previous-metric';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';
import { Stat, StatStrip } from '../common/stat-strip';
import { useReportChartContext } from '../context';
import { ColorSquare } from '@/components/color-square';
import {
  type ReportColumn,
  ReportDataTable,
  type ReportRowIdentity,
} from '@/components/report-table/report-data-table';
import { Button } from '@/components/ui/button';
import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';
import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';

type Funnel = RouterOutputs['chart']['funnel']['current'][number];
type Step = Funnel['steps'][number];

interface StepRow {
  id: string;
  index: number;
  step: Step;
}

const ACTION_WIDTH = 56;

/** One row per funnel step: how many got there, how many left after it, and the conversion so far. */
export function StepsTable({
  funnel,
  previous,
}: {
  funnel: Funnel;
  previous: Funnel | null;
}) {
  const { report, shareId } = useReportChartContext();
  const timeToConvert =
    report.options?.type === 'funnel'
      ? report.options.timeToConvert
      : undefined;
  const rows = useMemo(
    () =>
      funnel.steps.map(
        (step, index): StepRow => ({
          id: step.event.id ?? `${index}`,
          index,
          step,
        })
      ),
    [funnel.steps]
  );

  const identity = useMemo<ReportRowIdentity<StepRow>>(
    () => ({
      header: 'Step',
      render: (row) => (
        <span className="flex items-center gap-2">
          <ColorSquare color={getChartColor(row.index)}>
            {alphabetIds[row.index]}
          </ColorSquare>
          <span className="truncate">{row.step.event.displayName}</span>
        </span>
      ),
      searchText: (row) => row.step.event.displayName,
    }),
    []
  );

  const inspectStep = useCallback(
    (row: StepRow) => {
      if (!(report.projectId && row.step.event.id)) {
        return;
      }
      // The modal lists the users who reached at least this step of the sequence.
      pushModal('ViewChartUsers', {
        type: 'funnel',
        report: {
          projectId: report.projectId,
          series: report.series,
          breakdowns: report.breakdowns || [],
          interval: report.interval || 'day',
          startDate: report.startDate,
          endDate: report.endDate,
          range: report.range,
          previous: report.previous,
          chartType: 'funnel',
          metric: 'sum',
          options:
            report.options?.type === 'funnel' ? report.options : undefined,
        },
        stepIndex: row.index,
        breakdownValues: funnel.breakdowns,
      });
    },
    [report, funnel.breakdowns]
  );

  const columns = useMemo<ReportColumn<StepRow>[]>(
    () => [
      { id: 'count', header: 'Completed', value: (row) => row.step.count },
      {
        id: 'dropoff',
        header: 'Dropped after',
        value: (row) => row.step.dropoffCount,
        width: 130,
        render: (row, formatted) => (
          <span className={row.step.isHighestDropoff ? 'text-red-500' : ''}>
            {formatted}
          </span>
        ),
      },
      {
        id: 'percent',
        header: 'Conversion',
        value: (row) => row.step.percent,
        format: 'percent',
        decorate: 'bar',
        width: 150,
      },
      ...(timeToConvert
        ? [
            {
              id: 'timeToConvert',
              header: 'Time to convert',
              value: (row: StepRow) => row.step.timeToConvert,
              format: 'minutes' as const,
              width: 140,
            },
          ]
        : []),
      ...(shareId
        ? []
        : [
            {
              id: 'users',
              header: '',
              value: () => '',
              format: 'text' as const,
              sortable: false,
              width: ACTION_WIDTH,
              render: (row: StepRow) => (
                <Button
                  className="h-7 w-7 p-0"
                  onClick={() => inspectStep(row)}
                  size="sm"
                  title="View users who completed this step"
                  variant="ghost"
                >
                  <UsersIcon size={14} />
                </Button>
              ),
            },
          ]),
    ],
    [shareId, inspectStep, timeToConvert]
  );

  return (
    <div className="col">
      <FunnelMetrics
        funnel={funnel}
        previous={previous}
        timeToConvert={timeToConvert}
      />
      <ReportDataTable
        columns={columns}
        csvFilename={`${report.name || 'funnel'}${funnel.breakdowns.length ? ` ${funnel.breakdowns.join(' ')}` : ''}`}
        getRowId={(row) => row.id}
        identity={identity}
        rows={rows}
        searchable={false}
      />
    </div>
  );
}

function FunnelMetrics({
  funnel,
  previous,
  timeToConvert,
}: {
  funnel: Funnel;
  previous: Funnel | null;
  timeToConvert: ITimeToConvertAggregation | undefined;
}) {
  const number = useNumber();
  const change = (
    current: number,
    before: number | null | undefined,
    inverted?: boolean
  ) =>
    before == null ? undefined : (
      <PreviousDiffIndicatorPure
        {...getPreviousMetric(current, before)}
        inverted={inverted}
        size="xs"
      />
    );
  const totalTimeToConvert = timeToConvert ? funnel.timeToConvert : null;
  return (
    <StatStrip
      className={
        totalTimeToConvert === null
          ? 'border-b md:grid-cols-3'
          : 'border-b md:grid-cols-4'
      }
      framed={false}
    >
      <Stat
        change={change(funnel.lastStep.percent, previous?.lastStep.percent)}
        label="Conversion"
        value={number.formatWithUnit(funnel.lastStep.percent / 100, '%')}
      />
      <Stat
        change={change(funnel.lastStep.count, previous?.lastStep.count)}
        label="Completed"
        value={number.format(funnel.lastStep.count)}
      />
      {funnel.mostDropoffsStep && (
        <Stat
          detail={`${number.format(funnel.mostDropoffsStep.dropoffCount ?? 0)} dropped after this step`}
          label="Most drop-offs after"
          value={funnel.mostDropoffsStep.event.displayName}
        />
      )}
      {timeToConvert && totalTimeToConvert !== null && (
        <Stat
          // Faster is better, so a drop reads as an improvement.
          change={change(totalTimeToConvert, previous?.timeToConvert, true)}
          detail={`${timeToConvertAggregations[timeToConvert]}, first to last step`}
          label="Time to convert"
          value={fancyMinutes(totalTimeToConvert)}
        />
      )}
    </StatStrip>
  );
}
