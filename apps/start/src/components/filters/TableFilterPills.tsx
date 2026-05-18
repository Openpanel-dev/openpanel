import { FilterIcon, X } from 'lucide-react';
import type { Options as NuqsOptions } from 'nuqs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PropertiesComboboxCategory } from '@/components/report/sidebar/PropertiesCombobox';
import { useAppParams } from '@/hooks/use-app-params';
import { useCohorts } from '@/hooks/use-cohorts';
import { useTableFilters } from '@/hooks/use-table-filters';
import { pushModal } from '@/modals';
import { getPropertyLabel } from '@/translations/properties';
import { cn } from '@/utils/cn';
import { operators } from '@openpanel/constants';
import {
  getCohortIds,
  type IChartEventFilter,
} from '@openpanel/validation';

interface TableFilterPillsProps {
  /** URL key the filters live under. Sessions tables use `f`. */
  urlKey: string;
  /** Categories surfaced when the user opens the sheet to add a filter. */
  categories: PropertiesComboboxCategory[];
  /** Header rendered inside the sheet. */
  title?: string;
  className?: string;
  /** Forwarded to `useTableFilters` (e.g. to disable URL push). */
  nuqsOptions?: NuqsOptions;
}

/** Friendly labels for the hard-coded session.* filter family. */
const SESSION_LABELS: Record<string, string> = {
  'session.is_bounce': 'Bounced',
  'session.screen_view_count': 'Screen views',
  'session.event_count': 'Events',
  'session.duration': 'Duration',
  'session.revenue': 'Revenue',
  'session.performed_event': 'Performed event',
};

function humanizeFilterName(name: string): string {
  if (name.startsWith('cohort:')) return 'Cohort';
  if (SESSION_LABELS[name]) return SESSION_LABELS[name]!;
  if (name.startsWith('profile.')) {
    const rest = name.replace(/^profile\./, '');
    return `Profile · ${rest.replace(/^properties\./, '')}`;
  }
  if (name.startsWith('group.')) {
    const rest = name.replace(/^group\./, '');
    return `Group · ${rest.replace(/^properties\./, '')}`;
  }
  return getPropertyLabel(name);
}

function formatFilterValue(filter: IChartEventFilter): string {
  if (filter.name === 'session.is_bounce') {
    const v = filter.value[0];
    if (v === undefined) return '';
    const truthy =
      typeof v === 'boolean' ? v : String(v).toLowerCase() === 'true';
    return truthy ? 'Yes' : 'No';
  }
  return filter.value
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map(String)
    .join(', ');
}

export function TableFilterPills({
  urlKey,
  categories,
  title,
  className,
  nuqsOptions,
}: TableFilterPillsProps) {
  const { projectId } = useAppParams();
  const [filters, setFilters] = useTableFilters(urlKey, nuqsOptions);
  const cohorts = useCohorts(
    { projectId, includeCount: false },
    { enabled: categories.includes('cohort') },
  );
  const cohortNames = new Map(cohorts.map((c) => [c.id, c.name]));

  const openSheet = () => {
    pushModal('TableFilters', {
      urlKey,
      categories,
      title,
    });
  };

  const removeAt = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('row flex-wrap items-center gap-2', className)}>
      <Button
        variant="outline"
        size="sm"
        icon={FilterIcon}
        onClick={openSheet}
      >
        Filters
        {filters.length > 0 && (
          <Badge className="ml-2 rounded-full px-1.5 py-0 text-xs">
            {filters.length}
          </Badge>
        )}
      </Button>
      {filters.map((filter, index) => {
        const isCohort =
          filter.operator === 'inCohort' || filter.operator === 'notInCohort';
        const cohortIds = isCohort ? getCohortIds(filter) : [];
        const valueText = isCohort
          ? cohortIds
              .map(
                (id) => cohortNames.get(id) ?? cohortNames.get(id.replace(/^cohort:/, '')),
              )
              .filter(Boolean)
              .join(', ') || 'pick cohort'
          : formatFilterValue(filter);

        return (
          <div
            key={`${filter.name}-${index}`}
            className="flex items-stretch text-sm border rounded-md overflow-hidden h-8 bg-card"
          >
            <button
              type="button"
              onClick={openSheet}
              className="px-2 hover:bg-accent transition-colors cursor-pointer"
            >
              {humanizeFilterName(filter.name)}
            </button>
            <button
              type="button"
              onClick={openSheet}
              className="px-2 opacity-50 lowercase hover:opacity-100 hover:bg-accent transition-colors border-l cursor-pointer"
            >
              {operators[filter.operator] ?? filter.operator}
            </button>
            {valueText && (
              <button
                type="button"
                onClick={openSheet}
                className="px-2 font-semibold hover:bg-accent transition-colors border-l cursor-pointer max-w-40 truncate"
              >
                {valueText}
              </button>
            )}
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="px-2 hover:bg-destructive hover:text-destructive-foreground transition-colors border-l cursor-pointer"
              aria-label="Remove filter"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
