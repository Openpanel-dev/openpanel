import { PureCohortFilterItem } from '@/components/report/sidebar/filters/CohortFilterItem';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { SheetContent } from '@/components/ui/sheet';
import { useEventNames } from '@/hooks/use-event-names';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';
import { useProfileValues } from '@/hooks/use-profile-values';
import {
  FilterIcon,
  GanttChartIcon,
  GlobeIcon,
  type LucideIcon,
  SlidersHorizontal,
  SparklesIcon,
  XIcon,
} from 'lucide-react';
import type { Options as NuqsOptions } from 'nuqs';
import { useTranslation } from 'react-i18next';

import type {
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
} from '@openpanel/validation';

import { OriginFilter } from '@/components/overview/filters/origin-filter';
import { OverviewAICommand } from '@/components/overview/overview-ai-command';
import { PropertiesCombobox } from '@/components/report/sidebar/PropertiesCombobox';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { useAppParams } from '@/hooks/use-app-params';
import { cn } from '@/utils/cn';
import { ModalHeader } from './Modal/Container';

export interface OverviewFiltersProps {
  nuqsOptions?: NuqsOptions;
  enableEventsFilter?: boolean;
  mode?: 'events' | 'profile';
}

const Seperator = () => <div className="h-px bg-border -mx-6" />;
const Heading = ({
  title,
  icon: Icon,
}: {
  title: string;
  icon: LucideIcon;
}) => (
  <div className="row items-center gap-2">
    <Icon className="size-4" />
    <h2 className="text-sm font-medium">{title}</h2>
  </div>
);

export default function OverviewFilters({
  nuqsOptions,
  enableEventsFilter,
  mode,
}: OverviewFiltersProps) {
  const { t } = useTranslation();
  const { projectId } = useAppParams();
  const [filters, setFilter, setFilters, removeFilter] =
    useEventQueryFilters(nuqsOptions);
  const [event, setEvent] = useEventQueryNamesFilter(nuqsOptions);
  const eventNames = useEventNames({ projectId, anyEvents: false });
  const selectedFilters = filters.filter((filter) => filter.value[0] !== null);

  const isCohortFilter = (filter: IChartEventFilter) =>
    filter.operator === 'inCohort' || filter.operator === 'notInCohort';

  const updateCohortFilter = (updated: IChartEventFilter) => {
    setFilters((prev) =>
      prev.map((f) =>
        f.name === updated.name
          ? {
              id: updated.id ?? updated.name,
              name: updated.name,
              operator: updated.operator,
              value: updated.value.map((v) => (v == null ? '' : String(v))),
              ...(updated.cohortIds ? { cohortIds: updated.cohortIds } : {}),
              ...(updated.cohortId ? { cohortId: updated.cohortId } : {}),
            }
          : f,
      ),
    );
  };
  return (
    <SheetContent className="[&>button.absolute]:hidden">
      <ModalHeader title={t('filters.filters')} />
      <div className="flex flex-col gap-4">
        <Heading icon={SparklesIcon} title={t('filters.ask_ai')} />
        <OverviewAICommand className="w-full" />
        <Seperator />
        <Heading icon={GlobeIcon} title={t('filters.origins')} />
        <OriginFilter />
        <Seperator />
        {enableEventsFilter && (
          <>
            <Heading icon={GanttChartIcon} title={t('filters.events')} />
            <ComboboxEvents
              size="lg"
              className="w-full"
              value={event}
              onChange={setEvent}
              multiple
              items={eventNames}
              placeholder={t('notifications.select_event')}
              maxDisplayItems={2}
              searchable
            />
            <Seperator />
          </>
        )}
      </div>
      <Heading icon={SlidersHorizontal} title={t('filters.filters')} />
      <div className="flex flex-col gap-2">
        <div className={cn('bg-card rounded-lg border')}>
          {selectedFilters.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t('filters.no_filters_selected')}
            </div>
          )}
          {selectedFilters.map((filter) => {
            if (isCohortFilter(filter)) {
              return (
                <PureCohortFilterItem
                  className="border-t p-4 first:border-0"
                  key={filter.id ?? filter.name}
                  filter={filter}
                  onRemove={(target) => removeFilter(target.name)}
                  onChangeOperator={(operator, original) =>
                    updateCohortFilter({ ...original, operator })
                  }
                  onChangeCohort={(cohortIds, original) =>
                    updateCohortFilter({
                      ...original,
                      cohortId: cohortIds[0],
                      cohortIds,
                    })
                  }
                />
              );
            }
            return (
              <PureFilterItem
                className="border-t p-4 first:border-0"
                eventName="screen_view"
                key={filter.name}
                filter={filter}
                onRemove={() => {
                  setFilter(filter.name, [], filter.operator);
                }}
                onChangeValue={(value) => {
                  setFilter(filter.name, value, filter.operator);
                }}
                onChangeOperator={(operator) => {
                  setFilter(filter.name, filter.value, operator);
                }}
              />
            );
          })}
        </div>
        <PropertiesCombobox
          categories={
            mode === 'events'
              ? ['event']
              : mode === 'profile'
                ? ['profile']
                : ['event', 'profile', 'group', 'cohort']
          }
          exclude={
            enableEventsFilter
              ? []
              : [
                  'properties.*',
                  'name',
                  'duration',
                  'created_at',
                  'has_profile',
                ]
          }
          onSelect={(action) => {
            if (action.value === 'cohort') {
              // Only one cohort filter at a time; OR-semantics live inside
              // the filter's cohortIds array.
              const hasCohort = filters.some(isCohortFilter);
              if (hasCohort) return;
              setFilters((prev) => [
                ...prev,
                {
                  id: 'cohort',
                  name: 'cohort',
                  operator: 'inCohort',
                  value: [],
                  cohortIds: [],
                },
              ]);
              return;
            }
            setFilter(action.value, [], 'is');
          }}
        >
          {(setOpen) => (
            <Button
              onClick={() => setOpen((p) => !p)}
              variant="outline"
              size="lg"
              className="w-full"
              icon={FilterIcon}
            >
              {t('filters.add_filter')}
            </Button>
          )}
        </PropertiesCombobox>
      </div>
    </SheetContent>
  );
}

export function FilterOptionProfile({
  setFilter,
  projectId,
  ...filter
}: IChartEventFilter & {
  projectId: string;
  setFilter: (
    name: string,
    value: IChartEventFilterValue,
    operator: IChartEventFilterOperator,
  ) => void;
}) {
  const { t } = useTranslation();
  const values = useProfileValues(projectId, filter.name);

  return (
    <div className="flex items-center gap-2">
      <div>{filter.name}</div>
      <Combobox
        className="flex-1"
        onChange={(value) => setFilter(filter.name, value, filter.operator)}
        placeholder={t('filters.select_value')}
        items={values.map((value) => ({
          value,
          label: value,
        }))}
        value={String(filter.value[0] ?? '')}
      />
      <Button
        size="icon"
        variant="ghost"
        onClick={() =>
          setFilter(filter.name, filter.value[0] ?? '', filter.operator)
        }
      >
        <XIcon />
      </Button>
    </div>
  );
}
