import { CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ToolResultProps } from './types';

/**
 * Renderers for the client-side UI-mutator tools:
 *   - apply_filters             (date range / interval)
 *   - set_property_filters      (country, device, referrer_name, …)
 *   - set_event_names_filter    (event-name whitelist)
 *
 * These tools run instantly on the client (they just push URL params),
 * so there's nothing to shimmer for. We bypass `ToolStateGuard` and
 * always render a tidy confirmation chip with a summary parsed from
 * the tool's INPUT args — even on the `input-complete` intermediate
 * state the chip looks "done" because the action has already landed.
 */

export function ApplyFiltersResult({ part }: ToolResultProps) {
  const input = (part.input ?? {}) as {
    range?: string;
    startDate?: string;
    endDate?: string;
    interval?: string;
  };
  const parts: string[] = [];
  if (input.startDate && input.endDate) {
    parts.push(`date range: ${input.startDate} → ${input.endDate}`);
  } else if (input.range) {
    parts.push(`date range: ${formatRange(input.range)}`);
  }
  if (input.interval) {
    parts.push(`interval: ${input.interval}`);
  }
  const summary = parts.length > 0 ? parts.join(' · ') : 'filters';
  return <AppliedChip>Applied {summary}</AppliedChip>;
}

export function SetPropertyFiltersResult({ part }: ToolResultProps) {
  const input = (part.input ?? {}) as {
    filters?: Array<{
      name?: string;
      operator?: string;
      value?: string[];
    }>;
  };
  const filters = Array.isArray(input.filters) ? input.filters : [];
  if (filters.length === 0) {
    return <AppliedChip>Cleared property filters</AppliedChip>;
  }
  const summary = filters
    .map((f) => {
      const op = f.operator && f.operator !== 'is' ? ` ${f.operator}` : '';
      const value = Array.isArray(f.value) ? f.value.join(', ') : '';
      return `${f.name}${op}${value ? ` = ${value}` : ''}`;
    })
    .join(' · ');
  return <AppliedChip>Applied filters: {summary}</AppliedChip>;
}

export function SetEventNamesFilterResult({ part }: ToolResultProps) {
  const input = (part.input ?? {}) as { eventNames?: string[] };
  const names = Array.isArray(input.eventNames) ? input.eventNames : [];
  if (names.length === 0) {
    return <AppliedChip>Cleared event-name filter</AppliedChip>;
  }
  return (
    <AppliedChip>
      Filtered to {names.length === 1 ? 'event' : 'events'}: {names.join(', ')}
    </AppliedChip>
  );
}

function AppliedChip({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-sm text-foreground/80">
      <CheckIcon className="size-3.5 text-emerald-500 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

function formatRange(range: string): string {
  switch (range) {
    case '30min':
      return 'Last 30 min';
    case 'lastHour':
      return 'Last hour';
    case 'today':
      return 'Today';
    case 'yesterday':
      return 'Yesterday';
    case '7d':
      return 'Last 7 days';
    case '30d':
      return 'Last 30 days';
    case '6m':
      return 'Last 6 months';
    case '12m':
      return 'Last 12 months';
    case 'monthToDate':
      return 'Month to date';
    case 'lastMonth':
      return 'Last month';
    case 'yearToDate':
      return 'Year to date';
    case 'lastYear':
      return 'Last year';
    case 'custom':
      return 'Custom range';
    default:
      return range;
  }
}
