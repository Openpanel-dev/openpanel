import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventNames } from '@/hooks/use-event-names';
import type {
  ICustomEventDefinition,
  ICustomEventCriteria,
  IChartEventFilter,
} from '@openpanel/validation';
import { PlusIcon, TrashIcon, FilterIcon } from 'lucide-react';
import { useState } from 'react';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import { ColorSquare } from '@/components/color-square';

interface CustomEventBuilderProps {
  value: ICustomEventDefinition;
  onChange: (definition: ICustomEventDefinition) => void;
  projectId: string;
}

export function CustomEventBuilder({
  value,
  onChange,
  projectId,
}: CustomEventBuilderProps) {
  const eventNamesQuery = useEventNames({ projectId });

  // Transform array of event objects to format expected by ComboboxAdvanced
  // Filter out custom events (can't create custom event from custom events)
  const eventNames = (eventNamesQuery || [])
    .filter((event) => !event.isCustom && event.name !== '*')
    .map((event) => ({
      value: event.name,
      label: event.name,
      count: event.count,
      meta: event.meta,
    }));

  const addEvent = () => {
    onChange({
      ...value,
      events: [
        ...value.events,
        {
          name: '',
          filters: [],
        },
      ],
    });
  };

  const removeEvent = (index: number) => {
    onChange({
      ...value,
      events: value.events.filter((_, i) => i !== index),
    });
  };

  const updateEvent = (index: number, criteria: ICustomEventCriteria) => {
    onChange({
      ...value,
      events: value.events.map((e, i) => (i === index ? criteria : e)),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm font-medium">
        Match when <span className="text-blue-600">ANY</span> of the following
        events happen:
      </div>

      {value.events.length === 0 && (
        <div className="rounded-md bg-muted p-4 text-center text-sm text-muted-foreground">
          No source events added yet. Click "Add Event" to get started.
        </div>
      )}

      {value.events.map((eventCriteria, index) => (
        <EventCriteriaItem
          key={index}
          criteria={eventCriteria}
          onChange={(criteria) => updateEvent(index, criteria)}
          onRemove={() => removeEvent(index)}
          eventNames={eventNames}
          projectId={projectId}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={addEvent}
        icon={PlusIcon}
        className="w-full"
      >
        Add Event
      </Button>

      {value.events.length > 20 && (
        <div className="text-sm text-destructive">
          Maximum 20 events allowed (Mixpanel limit)
        </div>
      )}
    </div>
  );
}

interface EventCriteriaItemProps {
  criteria: ICustomEventCriteria;
  onChange: (criteria: ICustomEventCriteria) => void;
  onRemove: () => void;
  eventNames: Array<{
    value: string;
    label: string;
    count: number;
    meta?: any;
  }>;
  projectId: string;
}

function EventCriteriaItem({
  criteria,
  onChange,
  onRemove,
  eventNames,
  projectId,
}: EventCriteriaItemProps) {
  const [showFilters, setShowFilters] = useState(
    criteria.filters && criteria.filters.length > 0,
  );

  const selectedEvent = eventNames.find((e) => e.value === criteria.name);

  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ComboboxAdvanced
            value={criteria.name}
            onChange={(name) => onChange({ ...criteria, name })}
            placeholder="Select event..."
            items={eventNames}
            renderLabel={(item) => (
              <div className="flex items-center gap-2">
                {item.meta?.icon && <span>{item.meta.icon}</span>}
                {item.meta?.color && <ColorSquare color={item.meta.color} />}
                <span>{item.label}</span>
                {item.count > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({item.count.toLocaleString()})
                  </span>
                )}
              </div>
            )}
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          title="Add filters"
        >
          <FilterIcon size={16} />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          title="Remove event"
        >
          <TrashIcon size={16} />
        </Button>
      </div>

      {showFilters && (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium text-muted-foreground">
            Event property filters (optional)
          </div>

          {criteria.filters && criteria.filters.length > 0 && (
            <div className="space-y-2">
              {criteria.filters.map((filter, index) => (
                <PureFilterItem
                  key={filter.id || index}
                  data={filter}
                  eventName={criteria.name}
                  onRemove={() => {
                    onChange({
                      ...criteria,
                      filters: criteria.filters?.filter((_, i) => i !== index),
                    });
                  }}
                  onChange={(updatedFilter) => {
                    onChange({
                      ...criteria,
                      filters: criteria.filters?.map((f, i) =>
                        i === index ? updatedFilter : f,
                      ),
                    });
                  }}
                />
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const newFilter: IChartEventFilter = {
                id: `filter-${Date.now()}`,
                name: '',
                operator: 'is',
                value: [],
              };
              onChange({
                ...criteria,
                filters: [...(criteria.filters || []), newFilter],
              });
            }}
            icon={PlusIcon}
          >
            Add filter
          </Button>
        </div>
      )}
    </div>
  );
}
