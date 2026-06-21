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
import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

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

function humanizeFilterName(name: string, t: TFunction): string {
  if (name === 'cohort' || name.startsWith('cohort:')) {
    return t('filters.cohort');
  }
  if (name === 'session.is_bounce') return t('filters.session_bounced');
  if (name === 'session.screen_view_count') {
    return t('filters.session_screen_views');
  }
  if (name === 'session.event_count') return t('filters.session_events');
  if (name === 'session.duration') return t('filters.session_duration');
  if (name === 'session.revenue') return t('filters.session_revenue');
  if (name === 'session.performed_event') {
    return t('filters.session_performed_event');
  }
  if (name.startsWith('profile.')) {
    const rest = name.replace(/^profile\./, '');
    return t('filters.profile_property', {
      property: rest.replace(/^properties\./, ''),
    });
  }
  if (name.startsWith('group.')) {
    const rest = name.replace(/^group\./, '');
    return t('filters.group_property', {
      property: rest.replace(/^properties\./, ''),
    });
  }
  return getPropertyLabel(name);
}

function formatFilterValue(filter: IChartEventFilter, t: TFunction): string {
  if (filter.name === 'session.is_bounce') {
    const v = filter.value[0];
    if (v === undefined) return '';
    const truthy =
      typeof v === 'boolean' ? v : String(v).toLowerCase() === 'true';
    return truthy ? t('filters.yes') : t('filters.no');
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
  const { t } = useTranslation();
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
        {t('filters.filters')}
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
              .join(', ') || t('filters.pick_cohort')
          : formatFilterValue(filter, t);

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
              {humanizeFilterName(filter.name, t)}
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
              aria-label={t('filters.remove_filter')}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
