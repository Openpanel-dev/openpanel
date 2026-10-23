// The report editor's "describe it" box: one request becomes a draft report
// the editor loads, built from the event names this project really tracks.
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import type { ServiceDeps } from '../../../services';
import {
  type IChartRange,
  type IReportInput,
  isHourIntervalEnabledByRange,
  isMinuteIntervalEnabledByRange,
  timeWindows,
} from '../../report/report.constants';
import { getDatesFromRange } from '../../report/src/chart-dates';
import { resolveDefaultChatModel } from './providers';
import { buildReportConfig, zChartInput } from './tools/charts';
import { discoveryTools } from './tools/discovery';

/** describe_data, maybe a property lookup or two, propose_report, one retry. */
const MAX_STEPS = 6;
const DATE_LENGTH = 10;
const DEFAULT_RANGE: IChartRange = '30d';
const MAX_SUMMARY_LENGTH = 200;

const PRESET_RANGES = Object.keys(timeWindows).filter(
  (key) => key !== 'custom'
) as [IChartRange, ...IChartRange[]];

export const zReportDraftProposal = zChartInput
  .omit({ startDate: true, endDate: true })
  .extend({
    range: z
      .enum(PRESET_RANGES)
      .optional()
      .describe(
        'Preset window. Omit only when startDate and endDate carry an explicit period.'
      ),
    startDate: z
      .string()
      .optional()
      .describe('YYYY-MM-DD. Only with endDate, and only without range.'),
    endDate: z.string().optional().describe('YYYY-MM-DD.'),
    summary: z
      .string()
      .max(MAX_SUMMARY_LENGTH)
      .describe(
        'One plain sentence saying what the chart shows, e.g. "Unique users who purchased, per day, by device, last 30 days".'
      ),
  });

export type ReportDraftProposal = z.infer<typeof zReportDraftProposal>;

export type ReportDraft = IReportInput & { name: string };

export interface ReportDraftInput {
  prompt: string;
  projectId: string;
  timezone: string;
}

/** `report` is null when the request could not be mapped; `summary` then says why. */
export interface ReportDraftResult {
  report: ReportDraft | null;
  summary: string;
}

/** A minute or hour interval on a long window would be thousands of points; snap like the editor's range picker does. */
function clampInterval(
  interval: ReportDraft['interval'],
  range: IChartRange
): ReportDraft['interval'] {
  if (interval === 'minute' && !isMinuteIntervalEnabledByRange(range)) {
    return 'hour';
  }
  if (interval === 'hour' && !isHourIntervalEnabledByRange(range)) {
    return 'day';
  }
  return interval;
}

/** The editor stores a preset as `range` with no dates, or `custom` with both dates. */
export function proposalToDraft(
  projectId: string,
  timezone: string,
  proposal: ReportDraftProposal
): { draft: ReportDraft } | { error: string; issues: unknown } {
  const hasCustomDates = Boolean(proposal.startDate && proposal.endDate);
  const range: IChartRange = hasCustomDates
    ? 'custom'
    : (proposal.range ?? DEFAULT_RANGE);
  const dates = hasCustomDates
    ? { startDate: proposal.startDate ?? '', endDate: proposal.endDate ?? '' }
    : getDatesFromRange(range, timezone);
  const { range: _range, summary: _summary, ...chartInput } = proposal;
  const built = buildReportConfig({ projectId }, { ...chartInput, ...dates });
  if ('error' in built) {
    return built;
  }
  return {
    draft: {
      ...built.config,
      range,
      startDate: hasCustomDates ? dates.startDate : null,
      endDate: hasCustomDates ? dates.endDate : null,
      interval: hasCustomDates
        ? built.config.interval
        : clampInterval(built.config.interval, range),
    },
  };
}

function presetCatalog(): string {
  return PRESET_RANGES.map(
    (key) => `\`${key}\` (${timeWindows[key].label})`
  ).join(', ');
}

function instructions(input: ReportDraftInput): string {
  const now = new Date();
  const today = now.toISOString().slice(0, DATE_LENGTH);
  const weekday = now.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return `You draft a report in the OpenPanel report editor. The user wrote what they want to see; you answer by calling propose_report with a config built from the events this project actually tracks.

# How to work
- Call describe_data first for the event names. Call it again with an eventName, or get_property_values, only when the request needs a property or an exact filter value.
- Then call propose_report once. Never invent event or property names; a name you did not see in a tool result does not exist.
- If the request cannot be mapped to tracked events, do not call propose_report. Reply with one short plain-text sentence (no markdown, no backticks) saying what is missing and which tracked events come closest.
- If propose_report returns issues, fix them and call it again.

# Choosing the chart
- \`linear\` for trends over time (the default), \`bar\` for top-N comparisons, \`pie\` for a few shares, \`metric\` for one number, \`funnel\` for ordered steps, \`retention\` for cohorts (interval week), \`conversion\` for an A-to-B rate over time, \`sankey\` for user flows, \`map\` for countries, \`histogram\` for distributions.
- Unique visitors or users: segment \`user\`. Sessions: segment \`session\`. Revenue or any sum: segment \`property_sum\` with the property. Rates: two event series plus a formula series such as \`B / A * 100\` with the inputs hidden.
- Page views are the \`screen_view\` event; filter on \`path\` for one page or section. Traffic sources, countries and devices are columns on every event: \`referrer_name\`, \`utm_source\`, \`country\`, \`device\`, \`browser\`, \`os\`.
- A breakdown splits every series by a column or \`properties.<key>\`.

# Time
- Prefer a preset range: ${presetCatalog()}. Use startDate and endDate only for an explicit period no preset expresses. Default to \`30d\`.
- Interval: \`hour\` for a day or two, \`day\` up to three months, \`week\` up to a year, \`month\` beyond. Retention uses \`week\`.
- Today is ${weekday}, ${today} (UTC). The project reports in the ${input.timezone} timezone.

# Naming
- title: 3 to 6 words, like a dashboard tile ("Purchases by device").
- summary: one plain sentence of what the chart shows.`;
}

const FALLBACK_SUMMARY =
  "Couldn't turn that into a report. Name the event you want to chart.";

export async function runReportDraft(
  deps: ServiceDeps,
  input: ReportDraftInput
): Promise<ReportDraftResult> {
  const resolved = resolveDefaultChatModel(deps.config);
  if (!resolved) {
    throw new Error(
      'No AI provider is configured: set OPENAI_API_KEY or ANTHROPIC_API_KEY.'
    );
  }
  let accepted: ReportDraftResult | null = null;
  const tools = {
    ...discoveryTools({ deps, projectId: input.projectId }),
    propose_report: tool({
      description:
        'Propose the report the user asked for. Call it once, after describe_data, with verified event and property names.',
      inputSchema: zReportDraftProposal,
      execute: (proposal) => {
        const built = proposalToDraft(
          input.projectId,
          input.timezone,
          proposal
        );
        if ('error' in built) {
          return built;
        }
        accepted = { report: built.draft, summary: proposal.summary };
        return { ok: true };
      },
    }),
  };
  const result = await generateText({
    model: resolved.model,
    instructions: instructions(input),
    prompt: input.prompt,
    tools,
    stopWhen: [isStepCount(MAX_STEPS), () => accepted !== null],
    reasoning: resolved.entry.reasoning,
  });
  deps.logger.info(
    {
      projectId: input.projectId,
      modelId: resolved.entry.id,
      steps: result.steps.length,
      accepted: accepted !== null,
    },
    'report draft finished'
  );
  if (accepted) {
    return accepted;
  }
  return { report: null, summary: result.text.trim() || FALLBACK_SUMMARY };
}
