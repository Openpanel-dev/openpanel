import { alphabetIds } from '@openpanel/core/modules/report/report.constants';
import { InfoIcon, UsersIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { getPreviousMetric } from '../../../utils/previous-metric';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';
import { useReportChartContext } from '../context';
import { Metric } from './chart';
import { ColorSquare } from '@/components/color-square';
import {
  type ReportColumn,
  ReportDataTable,
  type ReportRowIdentity,
} from '@/components/report-table/report-data-table';
import { Button } from '@/components/ui/button';
import { Tooltiper } from '@/components/ui/tooltip';
import { useNumber } from '@/hooks/use-numer-formatter';
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
    [shareId, inspectStep]
  );

  return (
    <div className="col">
      <FunnelMetrics funnel={funnel} previous={previous} />
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
}: {
  funnel: Funnel;
  previous: Funnel | null;
}) {
  const number = useNumber();
  return (
    <div className="col md:row divide-border border-b bg-def-100 max-md:divide-y md:items-center md:divide-x">
      <Metric
        className="p-4 py-3"
        enhancer={
          previous && (
            <PreviousDiffIndicatorPure
              {...getPreviousMetric(
                funnel.lastStep.percent,
                previous.lastStep.percent
              )}
            />
          )
        }
        label="Conversion"
        value={number.formatWithUnit(funnel.lastStep.percent / 100, '%')}
      />
      <Metric
        className="p-4 py-3"
        enhancer={
          previous && (
            <PreviousDiffIndicatorPure
              {...getPreviousMetric(
                funnel.lastStep.count,
                previous.lastStep.count
              )}
            />
          )
        }
        label="Completed"
        value={number.format(funnel.lastStep.count)}
      />
      {funnel.mostDropoffsStep && (
        <Metric
          className="p-4 py-3"
          enhancer={
            <Tooltiper
              content={
                <span>
                  <span className="font-semibold">
                    {funnel.mostDropoffsStep.dropoffCount}
                  </span>{' '}
                  dropped after this event. Improve this step and your
                  conversion rate will likely increase.
                </span>
              }
              tooltipClassName="max-w-xs"
            >
              <InfoIcon className="size-3" />
            </Tooltiper>
          }
          label="Most dropoffs after"
          value={funnel.mostDropoffsStep.event.displayName}
        />
      )}
    </div>
  );
}
