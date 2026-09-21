import type {
  CohortDefinition,
  EventBasedCohortDefinition,
  EventCriteria,
  PropertyBasedCohortDefinition,
} from '@openpanel/core/modules/cohort/cohort.constants';
import type {
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
} from '@openpanel/core/modules/report/report.constants';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { PureFilterItem } from '../report/sidebar/filters/FilterItem';
import { PropertiesCombobox } from '../report/sidebar/PropertiesCombobox';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventNames } from '@/hooks/use-event-names';

interface CohortCriteriaBuilderProps {
  definition: CohortDefinition;
  onChange: (definition: CohortDefinition) => void;
}

export function CohortCriteriaBuilder({
  definition,
  onChange,
}: CohortCriteriaBuilderProps) {
  const { projectId } = useAppParams();
  const eventNames = useEventNames({ projectId });

  const handleTypeChange = (type: 'event' | 'property') => {
    if (type === 'event') {
      onChange({
        type: 'event',
        criteria: { events: [], operator: 'or' },
      });
    } else {
      onChange({
        type: 'property',
        criteria: { properties: [], operator: 'or' },
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => handleTypeChange('event')}
          type="button"
          variant={definition.type === 'event' ? 'default' : 'outline'}
        >
          Event-based
        </Button>
        <Button
          className="flex-1"
          onClick={() => handleTypeChange('property')}
          type="button"
          variant={definition.type === 'property' ? 'default' : 'outline'}
        >
          Property-based
        </Button>
      </div>

      {definition.type === 'event' && (
        <EventBasedBuilder
          definition={definition}
          eventNames={eventNames}
          onChange={onChange}
        />
      )}

      {definition.type === 'property' && (
        <PropertyBasedBuilder definition={definition} onChange={onChange} />
      )}
    </div>
  );
}

interface EventBasedBuilderProps {
  definition: EventBasedCohortDefinition;
  onChange: (definition: EventBasedCohortDefinition) => void;
  eventNames: Array<{ name: string; count: number; meta: unknown }>;
}

function EventBasedBuilder({
  definition,
  onChange,
  eventNames: eventNamesArray,
}: EventBasedBuilderProps) {
  const eventNames = eventNamesArray.map((event) => ({
    value: event.name,
    label: event.name,
    count: event.count,
  }));

  const addEventCriteria = () => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        events: [
          ...definition.criteria.events,
          {
            name: '',
            filters: [],
            timeframe: { type: 'relative', value: '30d' },
            frequency: { operator: 'gte', count: 1 },
          },
        ],
      },
    });
  };

  const removeEventCriteria = (index: number) => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        events: definition.criteria.events.filter((_, i) => i !== index),
      },
    });
  };

  const updateEventCriteria = (index: number, criteria: EventCriteria) => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        events: definition.criteria.events.map((e, i) =>
          i === index ? criteria : e
        ),
      },
    });
  };

  const updateOperator = (operator: 'or' | 'and') => {
    onChange({
      ...definition,
      criteria: { ...definition.criteria, operator },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Match</span>
        <DropdownMenuComposed
          items={[
            { value: 'or', label: 'Any of these events' },
            { value: 'and', label: 'All of these events' },
          ]}
          label="Operator"
          onChange={updateOperator}
        >
          <Button size="sm" variant="outline">
            {definition.criteria.operator === 'or' ? 'Any' : 'All'}
          </Button>
        </DropdownMenuComposed>
      </div>

      {definition.criteria.events.map((eventCriteria, index) => (
        <EventCriteriaItem
          criteria={eventCriteria}
          eventNames={eventNames}
          key={index}
          onChange={(criteria) => updateEventCriteria(index, criteria)}
          onRemove={() => removeEventCriteria(index)}
        />
      ))}

      <Button
        icon={PlusIcon}
        onClick={addEventCriteria}
        type="button"
        variant="outline"
      >
        Add event criteria
      </Button>
    </div>
  );
}

interface EventCriteriaItemProps {
  criteria: EventCriteria;
  onChange: (criteria: EventCriteria) => void;
  onRemove: () => void;
  eventNames: Array<{ value: string; label: string; count: number }>;
}

function EventCriteriaItem({
  criteria,
  onChange,
  onRemove,
  eventNames,
}: EventCriteriaItemProps) {
  const addFilter = (propertyName: string) => {
    onChange({
      ...criteria,
      filters: [
        ...criteria.filters,
        {
          id: Math.random().toString(36).substring(7),
          name: propertyName,
          operator: 'is',
          value: [],
        },
      ],
    });
  };

  const removeFilter = (filter: IChartEventFilter) => {
    onChange({
      ...criteria,
      filters: criteria.filters.filter((f) => f.id !== filter.id),
    });
  };

  const updateFilterValue = (
    value: IChartEventFilterValue[],
    filter: IChartEventFilter
  ) => {
    onChange({
      ...criteria,
      filters: criteria.filters.map((f) =>
        f.id === filter.id ? { ...f, value } : f
      ),
    });
  };

  const updateFilterOperator = (
    operator: IChartEventFilterOperator,
    filter: IChartEventFilter
  ) => {
    onChange({
      ...criteria,
      filters: criteria.filters.map((f) =>
        f.id === filter.id ? { ...f, operator, value: f.value.slice(0, 1) } : f
      ),
    });
  };

  return (
    <div className="rounded border p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex-1">
          <label className="mb-1 block font-medium text-sm">Event</label>
          <ComboboxAdvanced
            className="w-full"
            items={eventNames}
            onChange={(values) =>
              onChange({ ...criteria, name: String(values[0] ?? '') })
            }
            placeholder="Select event..."
            value={criteria.name ? [criteria.name] : []}
          />
        </div>
        <Button
          className="mt-6"
          onClick={onRemove}
          size="sm"
          type="button"
          variant="ghost"
        >
          <TrashIcon size={16} />
        </Button>
      </div>

      <div className="mb-3">
        <label className="mb-1 block font-medium text-sm">Frequency</label>
        <div className="flex gap-2">
          <DropdownMenuComposed
            items={[
              { value: 'gte', label: 'At least' },
              { value: 'eq', label: 'Exactly' },
              { value: 'lte', label: 'At most' },
            ]}
            label="Operator"
            onChange={(operator) => {
              const count = criteria.frequency?.count ?? 1;
              onChange({
                ...criteria,
                frequency: {
                  operator,
                  // "At least 0" matches everyone and the server rejects it,
                  // so a count of 0 only survives the operators that mean
                  // "never".
                  count: operator === 'gte' && count === 0 ? 1 : count,
                },
              });
            }}
          >
            <Button size="sm" variant="outline">
              {criteria.frequency?.operator === 'gte' && 'At least'}
              {criteria.frequency?.operator === 'eq' && 'Exactly'}
              {criteria.frequency?.operator === 'lte' && 'At most'}
            </Button>
          </DropdownMenuComposed>
          <input
            className="w-20 rounded border px-2 py-1 text-sm"
            min="0"
            onChange={(e) => {
              // Explicit NaN check, not `|| 1`: 0 is falsy, so the fallback
              // rewrote a typed 0 back to 1 and "never did this event" could
              // not be entered.
              const parsed = Number.parseInt(e.target.value, 10);
              const operator = criteria.frequency?.operator ?? 'gte';
              onChange({
                ...criteria,
                frequency: {
                  operator,
                  // Same "At least 0 matches everyone" clamp as the
                  // operator-change handler above.
                  count:
                    Number.isNaN(parsed) || (operator === 'gte' && parsed === 0)
                      ? 1
                      : parsed,
                },
              });
            }}
            type="number"
            value={criteria.frequency?.count ?? 1}
          />
          <span className="flex items-center text-muted-foreground text-sm">
            times
          </span>
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-1 block font-medium text-sm">Timeframe</label>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <DropdownMenuComposed
              items={[
                { value: 'relative', label: 'Last' },
                { value: 'since', label: 'Since' },
                { value: 'between', label: 'Between' },
              ]}
              label="Type"
              onChange={(type) => {
                if (type === 'relative') {
                  onChange({
                    ...criteria,
                    timeframe: { type: 'relative', value: '30d' },
                  });
                } else if (type === 'since') {
                  onChange({
                    ...criteria,
                    timeframe: {
                      type: 'absolute',
                      start: new Date().toISOString().split('T')[0] ?? '',
                    },
                  });
                } else {
                  const today = new Date().toISOString().split('T')[0] ?? '';
                  const thirtyDaysAgo =
                    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                      .toISOString()
                      .split('T')[0] ?? '';
                  onChange({
                    ...criteria,
                    timeframe: {
                      type: 'absolute',
                      start: thirtyDaysAgo,
                      end: today,
                    },
                  });
                }
              }}
            >
              <Button size="sm" variant="outline">
                {criteria.timeframe.type === 'relative'
                  ? 'Last'
                  : criteria.timeframe.type === 'absolute' &&
                      !criteria.timeframe.end
                    ? 'Since'
                    : 'Between'}
              </Button>
            </DropdownMenuComposed>
            {criteria.timeframe.type === 'relative' ? (
              <DropdownMenuComposed
                items={[
                  { value: '7d', label: '7 days' },
                  { value: '30d', label: '30 days' },
                  { value: '90d', label: '90 days' },
                  { value: '180d', label: '180 days' },
                  { value: '365d', label: '365 days' },
                ]}
                label="Period"
                onChange={(value) =>
                  onChange({
                    ...criteria,
                    timeframe: { type: 'relative', value },
                  })
                }
              >
                <Button size="sm" variant="outline">
                  {criteria.timeframe.value === '7d' && '7 days'}
                  {criteria.timeframe.value === '30d' && '30 days'}
                  {criteria.timeframe.value === '90d' && '90 days'}
                  {criteria.timeframe.value === '180d' && '180 days'}
                  {criteria.timeframe.value === '365d' && '365 days'}
                </Button>
              </DropdownMenuComposed>
            ) : criteria.timeframe.end ? null : (
              <input
                className="rounded border px-2 py-1 text-sm"
                onChange={(e) =>
                  onChange({
                    ...criteria,
                    timeframe: { type: 'absolute', start: e.target.value },
                  })
                }
                type="date"
                value={criteria.timeframe.start}
              />
            )}
          </div>
          {criteria.timeframe.type === 'absolute' && criteria.timeframe.end && (
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded border px-2 py-1 text-sm"
                onChange={(e) =>
                  onChange({
                    ...criteria,
                    timeframe: {
                      type: 'absolute',
                      start: e.target.value,
                      end:
                        criteria.timeframe.type === 'absolute'
                          ? criteria.timeframe.end
                          : undefined,
                    },
                  })
                }
                type="date"
                value={criteria.timeframe.start}
              />
              <span className="text-muted-foreground text-sm">to</span>
              <input
                className="flex-1 rounded border px-2 py-1 text-sm"
                onChange={(e) =>
                  onChange({
                    ...criteria,
                    timeframe: {
                      type: 'absolute',
                      start:
                        criteria.timeframe.type === 'absolute'
                          ? criteria.timeframe.start
                          : '',
                      end: e.target.value,
                    },
                  })
                }
                type="date"
                value={criteria.timeframe.end}
              />
            </div>
          )}
        </div>
      </div>

      {criteria.filters.length > 0 && (
        <div className="mb-2">
          <label className="mb-2 block font-medium text-sm">
            Event Filters
          </label>
          <div className="space-y-2">
            {criteria.filters.map((filter) => (
              <PureFilterItem
                className="rounded border p-2"
                eventName={criteria.name}
                filter={filter}
                key={filter.id}
                onChangeOperator={updateFilterOperator}
                onChangeValue={updateFilterValue}
                onRemove={removeFilter}
              />
            ))}
          </div>
        </div>
      )}

      <PropertiesCombobox
        categories={['event']}
        event={{ name: criteria.name, id: 'cohort-event' } as never}
        onSelect={(action) => {
          addFilter(action.value);
        }}
      >
        {(setOpen) => (
          <Button
            disabled={!criteria.name}
            icon={PlusIcon}
            onClick={() => setOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Add filter
          </Button>
        )}
      </PropertiesCombobox>
    </div>
  );
}

interface PropertyBasedBuilderProps {
  definition: PropertyBasedCohortDefinition;
  onChange: (definition: PropertyBasedCohortDefinition) => void;
}

function PropertyBasedBuilder({
  definition,
  onChange,
}: PropertyBasedBuilderProps) {
  const addPropertyFilter = (propertyName: string) => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        properties: [
          ...definition.criteria.properties,
          {
            id: Math.random().toString(36).substring(7),
            name: propertyName,
            operator: 'is',
            value: [],
          },
        ],
      },
    });
  };

  const removePropertyFilter = (filter: IChartEventFilter) => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        properties: definition.criteria.properties.filter(
          (f) => f.id !== filter.id
        ),
      },
    });
  };

  const updatePropertyFilterValue = (
    value: IChartEventFilterValue[],
    filter: IChartEventFilter
  ) => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        properties: definition.criteria.properties.map((f) =>
          f.id === filter.id ? { ...f, value } : f
        ),
      },
    });
  };

  const updatePropertyFilterOperator = (
    operator: IChartEventFilterOperator,
    filter: IChartEventFilter
  ) => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        properties: definition.criteria.properties.map((f) =>
          f.id === filter.id
            ? { ...f, operator, value: f.value.slice(0, 1) }
            : f
        ),
      },
    });
  };

  const updateOperator = (operator: 'or' | 'and') => {
    onChange({
      ...definition,
      criteria: { ...definition.criteria, operator },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Match</span>
        <DropdownMenuComposed
          items={[
            { value: 'or', label: 'Any of these properties' },
            { value: 'and', label: 'All of these properties' },
          ]}
          label="Operator"
          onChange={updateOperator}
        >
          <Button size="sm" variant="outline">
            {definition.criteria.operator === 'or' ? 'Any' : 'All'}
          </Button>
        </DropdownMenuComposed>
      </div>

      {definition.criteria.properties.length > 0 && (
        <div className="space-y-2">
          {definition.criteria.properties.map((filter) => (
            <PureFilterItem
              className="rounded border p-2"
              eventName=""
              filter={filter}
              key={filter.id}
              onChangeOperator={updatePropertyFilterOperator}
              onChangeValue={updatePropertyFilterValue}
              onRemove={removePropertyFilter}
            />
          ))}
        </div>
      )}

      <PropertiesCombobox
        categories={['profile']}
        onSelect={(action) => {
          addPropertyFilter(action.value);
        }}
      >
        {(setOpen) => (
          <Button
            icon={PlusIcon}
            onClick={() => setOpen(true)}
            type="button"
            variant="outline"
          >
            Add property filter
          </Button>
        )}
      </PropertiesCombobox>
    </div>
  );
}
