import { ReportChart } from '@/components/report-chart';
import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import type { TFunction } from 'i18next';
import type { IReport, IReportInput } from '@openpanel/validation';
import { SaveIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { asReportOutput } from './output-types';
import { ResultCard, ToolStateGuard } from './shared';
import type { ToolResultProps } from './types';

/**
 * Renders the result of `get_report_data` / `generate_report` /
 * `preview_report_with_changes` / `get_funnel` / `get_rolling_active_users` —
 * all return `{ report, data }` we can plug into `<ReportChart>`.
 *
 * Title priority (first match wins):
 *   1. `output.name` if the tool returned one (e.g. a saved report's name)
 *   2. A nice derived title from the tool's INPUT args (funnel → "Funnel: A → B", etc.)
 *   3. `"<CHART_TYPE> chart"` fallback
 */
export function ChatReportResult({ part }: ToolResultProps) {
  return (
    <ToolStateGuard
      state={part.state}
      errorText={part.errorText}
      toolName={part.type.replace(/^tool-/, '')}
    >
      <ChatReportInner
        output={part.output}
        input={part.input}
        toolType={part.type}
      />
    </ToolStateGuard>
  );
}

function ChatReportInner({
  output,
  input,
  toolType,
}: {
  output: unknown;
  input: unknown;
  toolType: string;
}) {
  const { t } = useTranslation();
  const value = asReportOutput(output);
  if (!value || value.error) {
    return (
      <ResultCard>
        <div className="px-3 py-2 text-sm text-muted-foreground">
          {value?.error ?? t('chat.result_no_data')}
        </div>
      </ResultCard>
    );
  }

  const report = value.report;
  if (!report || !report.chartType) {
    return (
      <ResultCard title={value.name ?? t('chat.result_report')}>
        <div className="px-3 py-2 text-sm text-muted-foreground">
          {t('chat.result_no_renderable_report_config')}
        </div>
      </ResultCard>
    );
  }

  const title =
    value.name ??
    deriveTitleFromInput(toolType, input, t) ??
    t('chat.result_chart_report_title', {
      chart: humanizeChartType(String(report.chartType), t),
    });

  return (
    <ResultCard title={title}>
      <div className="p-2">
        <ReportChart
          report={report as unknown as IReportInput}
          lazy={false}
          options={{
            hideLegend: false,
            hideXAxis: false,
            minHeight: 180,
            maxHeight: 260,
          }}
        />
      </div>
      {value.dashboard_url && (
        <div className="border-t px-3 py-1.5 flex items-center justify-between gap-2">
          <a
            href={value.dashboard_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:underline"
          >
            {t('chat.result_open_in_dashboard')}
          </a>
          {!report.id && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-sm"
              onClick={() =>
                pushModal('SaveReport', {
                  report: report as unknown as IReport,
                  disableRedirect: true,
                })
              }
            >
              <SaveIcon className="size-3 mr-1" />
              {t('common.save')}
            </Button>
          )}
        </div>
      )}
    </ResultCard>
  );
}

/**
 * Build a human title from the tool call's input args. The model
 * often calls chart tools without setting `output.name` explicitly
 * — we can do better than `"LINEAR chart"` by reading what the
 * user actually asked for.
 */
function deriveTitleFromInput(
  toolType: string,
  input: unknown,
  t: TFunction,
): string | null {
  if (!input || typeof input !== 'object') return null;
  const args = input as {
    steps?: unknown;
    series?: Array<{ name?: string; displayName?: string }>;
    chartType?: string;
    windowDays?: number;
    days?: number;
  };

  switch (toolType) {
    case 'tool-get_funnel': {
      if (Array.isArray(args.steps) && args.steps.length > 0) {
        const names = args.steps.filter((s): s is string => typeof s === 'string');
        if (names.length > 0) {
          return t('chat.result_funnel_title', { steps: names.join(' → ') });
        }
      }
      return t('chat.result_chart_type_funnel');
    }

    case 'tool-get_rolling_active_users': {
      const w = args.windowDays ?? 1;
      const label =
        w === 1
          ? 'DAU'
          : w === 7
            ? 'WAU'
            : w === 30
              ? 'MAU'
              : t('chat.result_day_active_users', { count: w });
      const days = args.days ?? 30;
      return t('chat.result_active_users_title', { label, count: days });
    }

    case 'tool-generate_report': {
      const events = Array.isArray(args.series)
        ? args.series
            .map((s) => s?.displayName || s?.name)
            .filter((n): n is string => typeof n === 'string' && n.length > 0)
        : [];
      const kind = args.chartType
        ? humanizeChartType(args.chartType, t)
        : t('chat.result_report');
      if (events.length === 0) return kind;
      if (events.length === 1) return `${kind}: ${events[0]}`;
      return `${kind}: ${events.join(', ')}`;
    }

    default:
      return null;
  }
}

function humanizeChartType(type: string, t: TFunction): string {
  switch (type) {
    case 'linear':
      return t('chat.result_chart_type_linear');
    case 'bar':
      return t('chat.result_chart_type_bar');
    case 'area':
      return t('chat.result_chart_type_area');
    case 'pie':
      return t('chat.result_chart_type_pie');
    case 'funnel':
      return t('chat.result_chart_type_funnel');
    case 'metric':
      return t('chat.result_chart_type_metric');
    case 'retention':
      return t('chat.result_chart_type_retention');
    case 'histogram':
      return t('chat.result_chart_type_histogram');
    case 'sankey':
      return t('chat.result_chart_type_sankey');
    case 'map':
      return t('chat.result_chart_type_map');
    case 'conversion':
      return t('chat.result_chart_type_conversion');
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}
