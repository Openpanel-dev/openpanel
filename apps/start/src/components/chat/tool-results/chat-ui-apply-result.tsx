import { CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolResultProps } from './types';
import { getTimeWindowLabelKey } from '@/utils/time-window-label';

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
  const { t } = useTranslation();
  const input = (part.input ?? {}) as {
    range?: string;
    startDate?: string;
    endDate?: string;
    interval?: string;
  };
  const parts: string[] = [];
  if (input.startDate && input.endDate) {
    parts.push(
      t('chat.ui_apply_date_range_summary', {
        value: `${input.startDate} → ${input.endDate}`,
      }),
    );
  } else if (input.range) {
    parts.push(
      t('chat.ui_apply_date_range_summary', {
        value: formatRange(input.range, t),
      }),
    );
  }
  if (input.interval) {
    parts.push(t('chat.ui_apply_interval_summary', { value: input.interval }));
  }
  const summary =
    parts.length > 0 ? parts.join(' · ') : t('chat.ui_apply_filters_summary');
  return <AppliedChip>{t('chat.ui_apply_applied_summary', { summary })}</AppliedChip>;
}

export function SetPropertyFiltersResult({ part }: ToolResultProps) {
  const { t } = useTranslation();
  const input = (part.input ?? {}) as {
    filters?: Array<{
      name?: string;
      operator?: string;
      value?: string[];
    }>;
  };
  const filters = Array.isArray(input.filters) ? input.filters : [];
  if (filters.length === 0) {
    return <AppliedChip>{t('chat.ui_apply_cleared_property_filters')}</AppliedChip>;
  }
  const summary = filters
    .map((f) => {
      const op = f.operator && f.operator !== 'is' ? ` ${f.operator}` : '';
      const value = Array.isArray(f.value) ? f.value.join(', ') : '';
      return `${f.name}${op}${value ? ` = ${value}` : ''}`;
    })
    .join(' · ');
  return <AppliedChip>{t('chat.ui_apply_applied_filters', { summary })}</AppliedChip>;
}

export function SetEventNamesFilterResult({ part }: ToolResultProps) {
  const { t } = useTranslation();
  const input = (part.input ?? {}) as { eventNames?: string[] };
  const names = Array.isArray(input.eventNames) ? input.eventNames : [];
  if (names.length === 0) {
    return <AppliedChip>{t('chat.ui_apply_cleared_event_filter')}</AppliedChip>;
  }
  return (
    <AppliedChip>
      {t('chat.ui_apply_filtered_events', {
        count: names.length,
        names: names.join(', '),
      })}
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

function formatRange(range: string, t: (key: string) => string): string {
  const key = getTimeWindowLabelKey(range);
  return key ? t(key) : range;
}
