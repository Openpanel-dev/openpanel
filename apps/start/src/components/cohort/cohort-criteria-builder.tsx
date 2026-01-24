import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { DropdownMenuComposed } from '@/components/ui/dropdown-menu';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventNames } from '@/hooks/use-event-names';
import { operators } from '@openpanel/constants';
import type {
  CohortDefinition,
  EventBasedCohortDefinition,
  PropertyBasedCohortDefinition,
  EventCriteria,
  IChartEventFilter,
} from '@openpanel/validation';
import { mapKeys } from '@openpanel/validation';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { ColorSquare } from '@/components/color-square';
import { SlidersHorizontal } from 'lucide-react';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';

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
        criteria: {
          events: [],
          operator: 'or',
        },
      });
    } else {
      onChange({
        type: 'property',
        criteria: {
          properties: [],
          operator: 'or',
        },
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={definition.type === 'event' ? 'default' : 'outline'}
          onClick={() => handleTypeChange('event')}
          className="flex-1"
        >
          Event-based
        </Button>
        <Button
          type="button"
          variant={definition.type === 'property' ? 'default' : 'outline'}
          onClick={() => handleTypeChange('property')}
          className="flex-1"
        >
          Property-based
        </Button>
      </div>

      {definition.type === 'event' && (
        <EventBasedBuilder
          definition={definition}
          onChange={onChange}
          eventNames={eventNames}
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
  eventNames: string[];
}

function EventBasedBuilder({
  definition,
  onChange,
  eventNames: eventNamesArray,
}: EventBasedBuilderProps) {
  // Transform array of strings to format expected by ComboboxAdvanced
  const eventNames = eventNamesArray.map((name) => ({
    value: name,
    label: name,
    count: 0,
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
            frequency: { operator: 'gte', value: 1 },
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
          i === index ? criteria : e,
        ),
      },
    });
  };

  const updateOperator = (operator: 'or' | 'and') => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        operator,
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Match</span>
        <DropdownMenuComposed
          onChange={updateOperator}
          items={[
            { value: 'or', label: 'Any of these events' },
            { value: 'and', label: 'All of these events' },
          ]}
          label="Operator"
        >
          <Button variant="outline" size="sm">
            {definition.criteria.operator === 'or' ? 'Any' : 'All'}
          </Button>
        </DropdownMenuComposed>
      </div>

      {definition.criteria.events.map((eventCriteria, index) => (
        <EventCriteriaItem
          key={index}
          criteria={eventCriteria}
          onChange={(criteria) => updateEventCriteria(index, criteria)}
          onRemove={() => removeEventCriteria(index)}
          eventNames={eventNames}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={addEventCriteria}
        icon={PlusIcon}
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
  const addFilter = () => {
    onChange({
      ...criteria,
      filters: [
        ...criteria.filters,
        {
          id: Math.random().toString(36).substring(7),
          name: '',
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
    value: Array<string | number>,
    filter: IChartEventFilter,
  ) => {
    onChange({
      ...criteria,
      filters: criteria.filters.map((f) =>
        f.id === filter.id ? { ...f, value } : f,
      ),
    });
  };

  const updateFilterOperator = (
    operator: IChartEventFilter['operator'],
    filter: IChartEventFilter,
  ) => {
    onChange({
      ...criteria,
      filters: criteria.filters.map((f) =>
        f.id === filter.id ? { ...f, operator, value: f.value.slice(0, 1) } : f,
      ),
    });
  };

  return (
    <div className="rounded border p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium">Event</label>
          <ComboboxAdvanced
            items={eventNames}
            value={criteria.name ? [criteria.name] : []}
            onChange={(values) =>
              onChange({ ...criteria, name: values[0] || '' })
            }
            placeholder="Select event..."
            className="w-full"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="mt-6"
        >
          <TrashIcon size={16} />
        </Button>
      </div>

      {/* Frequency */}
      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium">Frequency</label>
        <div className="flex gap-2">
          <DropdownMenuComposed
            onChange={(operator) =>
              onChange({
                ...criteria,
                frequency: { ...criteria.frequency!, operator },
              })
            }
            items={[
              { value: 'gte', label: 'At least' },
              { value: 'eq', label: 'Exactly' },
              { value: 'lte', label: 'At most' },
            ]}
            label="Operator"
          >
            <Button variant="outline" size="sm">
              {criteria.frequency?.operator === 'gte' && 'At least'}
              {criteria.frequency?.operator === 'eq' && 'Exactly'}
              {criteria.frequency?.operator === 'lte' && 'At most'}
            </Button>
          </DropdownMenuComposed>
          <input
            type="number"
            min="1"
            value={criteria.frequency?.value || 1}
            onChange={(e) =>
              onChange({
                ...criteria,
                frequency: {
                  ...criteria.frequency!,
                  value: parseInt(e.target.value) || 1,
                },
              })
            }
            className="w-20 rounded border px-2 py-1 text-sm"
          />
          <span className="flex items-center text-sm text-muted-foreground">
            times
          </span>
        </div>
      </div>

      {/* Timeframe */}
      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium">Timeframe</label>
        <div className="flex gap-2">
          <DropdownMenuComposed
            onChange={(type) => {
              if (type === 'relative') {
                onChange({
                  ...criteria,
                  timeframe: { type: 'relative', value: '30d' },
                });
              } else {
                onChange({
                  ...criteria,
                  timeframe: {
                    type: 'absolute',
                    value: new Date().toISOString().split('T')[0],
                  },
                });
              }
            }}
            items={[
              { value: 'relative', label: 'Last' },
              { value: 'absolute', label: 'Since' },
            ]}
            label="Type"
          >
            <Button variant="outline" size="sm">
              {criteria.timeframe.type === 'relative' ? 'Last' : 'Since'}
            </Button>
          </DropdownMenuComposed>
          {criteria.timeframe.type === 'relative' ? (
            <DropdownMenuComposed
              onChange={(value) =>
                onChange({
                  ...criteria,
                  timeframe: { type: 'relative', value },
                })
              }
              items={[
                { value: '7d', label: '7 days' },
                { value: '30d', label: '30 days' },
                { value: '90d', label: '90 days' },
                { value: '1y', label: '1 year' },
              ]}
              label="Period"
            >
              <Button variant="outline" size="sm">
                {criteria.timeframe.value.replace('d', ' days').replace('y', ' year')}
              </Button>
            </DropdownMenuComposed>
          ) : (
            <input
              type="date"
              value={criteria.timeframe.value}
              onChange={(e) =>
                onChange({
                  ...criteria,
                  timeframe: { type: 'absolute', value: e.target.value },
                })
              }
              className="rounded border px-2 py-1 text-sm"
            />
          )}
        </div>
      </div>

      {/* Filters */}
      {criteria.filters.length > 0 && (
        <div className="mb-2">
          <label className="mb-2 block text-sm font-medium">Event Filters</label>
          <div className="space-y-2">
            {criteria.filters.map((filter) => (
              <PureFilterItem
                key={filter.id}
                eventName={criteria.name}
                filter={filter}
                onRemove={removeFilter}
                onChangeValue={updateFilterValue}
                onChangeOperator={updateFilterOperator}
                className="rounded border p-2"
              />
            ))}
          </div>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addFilter}
        icon={PlusIcon}
        disabled={!criteria.name}
      >
        Add filter
      </Button>
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
  const addPropertyFilter = () => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        properties: [
          ...definition.criteria.properties,
          {
            id: Math.random().toString(36).substring(7),
            name: '',
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
          (f) => f.id !== filter.id,
        ),
      },
    });
  };

  const updatePropertyFilterValue = (
    value: Array<string | number>,
    filter: IChartEventFilter,
  ) => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        properties: definition.criteria.properties.map((f) =>
          f.id === filter.id ? { ...f, value } : f,
        ),
      },
    });
  };

  const updatePropertyFilterOperator = (
    operator: IChartEventFilter['operator'],
    filter: IChartEventFilter,
  ) => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        properties: definition.criteria.properties.map((f) =>
          f.id === filter.id
            ? { ...f, operator, value: f.value.slice(0, 1) }
            : f,
        ),
      },
    });
  };

  const updateOperator = (operator: 'or' | 'and') => {
    onChange({
      ...definition,
      criteria: {
        ...definition.criteria,
        operator,
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Match</span>
        <DropdownMenuComposed
          onChange={updateOperator}
          items={[
            { value: 'or', label: 'Any of these properties' },
            { value: 'and', label: 'All of these properties' },
          ]}
          label="Operator"
        >
          <Button variant="outline" size="sm">
            {definition.criteria.operator === 'or' ? 'Any' : 'All'}
          </Button>
        </DropdownMenuComposed>
      </div>

      {definition.criteria.properties.length > 0 && (
        <div className="space-y-2">
          {definition.criteria.properties.map((filter) => (
            <PureFilterItem
              key={filter.id}
              eventName=""
              filter={filter}
              onRemove={removePropertyFilter}
              onChangeValue={updatePropertyFilterValue}
              onChangeOperator={updatePropertyFilterOperator}
              className="rounded border p-2"
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={addPropertyFilter}
        icon={PlusIcon}
      >
        Add property filter
      </Button>
    </div>
  );
}
