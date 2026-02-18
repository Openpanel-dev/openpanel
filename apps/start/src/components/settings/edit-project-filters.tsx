import { WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import { PropertiesCombobox } from '@/components/report/sidebar/PropertiesCombobox';
import { Button } from '@/components/ui/button';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useEventNames } from '@/hooks/use-event-names';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { shortId } from '@openpanel/common';
import type {
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
  IProjectFilterEvent,
  IProjectFilterIp,
  IProjectFilterProfileId,
} from '@openpanel/validation';
import { zProjectFilterEvent } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

type Props = {
  project: NonNullable<RouterOutputs['project']['getProjectWithClients']>;
};

const validator = z.object({
  ips: z.array(z.string()),
  profileIds: z.array(z.string()),
  eventRules: z.array(zProjectFilterEvent.omit({ type: true })),
});

type IForm = z.infer<typeof validator>;
type IEventRule = IForm['eventRules'][number];

interface EventRuleItemProps {
  projectId: string;
  rule: IEventRule;
  onChange: (rule: IEventRule) => void;
  onRemove: () => void;
}

function EventRuleItem({
  projectId,
  rule,
  onChange,
  onRemove,
}: EventRuleItemProps) {
  const eventNames = useEventNames({ projectId, anyEvents: false });

  const addFilter = (action: {
    value: string;
    label: string;
    description: string;
  }) => {
    onChange({
      ...rule,
      filters: [
        ...rule.filters,
        { id: shortId(), name: action.value, operator: 'is', value: [] },
      ],
    });
  };

  const removeFilter = (filter: IChartEventFilter) => {
    onChange({
      ...rule,
      filters: rule.filters.filter((f) => f.id !== filter.id),
    });
  };

  const changeFilterValue = (
    value: IChartEventFilterValue[],
    filter: IChartEventFilter,
  ) => {
    onChange({
      ...rule,
      filters: rule.filters.map((f) =>
        f.id === filter.id ? { ...f, value } : f,
      ),
    });
  };

  const changeFilterOperator = (
    operator: IChartEventFilterOperator,
    filter: IChartEventFilter,
  ) => {
    onChange({
      ...rule,
      filters: rule.filters.map((f) =>
        f.id === filter.id
          ? { ...f, operator, value: f.value.filter(Boolean).slice(0, 1) }
          : f,
      ),
    });
  };

  return (
    <div className="rounded-lg border bg-def-100">
      <div className="flex items-center gap-2 p-4">
        <div className="flex-1">
          <ComboboxEvents
            placeholder="Select event name..."
            items={eventNames}
            value={rule.name}
            onChange={(name) => onChange({ ...rule, name })}
            className="w-full"
            searchable
          />
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2Icon size={16} />
        </Button>
      </div>

      {rule.filters.length > 0 && (
        <>
          {rule.filters.map((filter) => (
            <PureFilterItem
              key={filter.id}
              filter={filter}
              eventName={rule.name}
              onRemove={removeFilter}
              onChangeValue={changeFilterValue}
              onChangeOperator={changeFilterOperator}
              immediateInput
              className="border-t p-2 px-4 border-l-2 border-l-emerald-500"
            />
          ))}
        </>
      )}
      <div className="p-4 border-t">
        <PropertiesCombobox onSelect={addFilter} mode="events">
          {(setOpen) => (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(true)}
              icon={PlusIcon}
            >
              Add property filter
            </Button>
          )}
        </PropertiesCombobox>
      </div>
    </div>
  );
}

export default function EditProjectFilters({ project }: Props) {
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      ips: project.filters
        .filter((item): item is IProjectFilterIp => item.type === 'ip')
        .map((item) => item.ip),
      profileIds: project.filters
        .filter(
          (item): item is IProjectFilterProfileId => item.type === 'profile_id',
        )
        .map((item) => item.profileId),
      eventRules: project.filters
        .filter((item): item is IProjectFilterEvent => item.type === 'event')
        .map(({ name, filters, segment, property, displayName }) => ({
          name,
          filters,
          segment,
          property,
          displayName,
        })),
    },
  });

  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.project.update.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success('Project filters updated');
      },
    }),
  );

  const onSubmit = (values: IForm) => {
    mutation.mutate({
      id: project.id,
      filters: [
        ...values.ips.map((ip) => ({ type: 'ip' as const, ip })),
        ...values.profileIds.map((profileId) => ({
          type: 'profile_id' as const,
          profileId,
        })),
        ...values.eventRules
          .filter((rule) => rule.name)
          .map((rule) => ({
            type: 'event' as const,
            ...rule,
          })),
      ],
    });
  };

  const eventRules = form.watch('eventRules');

  const addEventRule = () => {
    form.setValue('eventRules', [
      ...eventRules,
      { name: '', filters: [], segment: 'event' },
    ]);
  };

  const updateEventRule = (index: number, rule: IEventRule) => {
    const updated = [...eventRules];
    updated[index] = rule;
    form.setValue('eventRules', updated);
  };

  const removeEventRule = (index: number) => {
    form.setValue(
      'eventRules',
      eventRules.filter((_, i) => i !== index),
    );
  };

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead className="space-y-2">
        <span className="title">Exclude events</span>
        <p className="text-muted-foreground">
          Exclude events from being tracked by adding filters.
        </p>
      </WidgetHead>
      <WidgetBody>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
              e.preventDefault();
            }
          }}
          className="space-y-4"
        >
          <Controller
            name="ips"
            control={form.control}
            render={({ field }) => (
              <WithLabel label="IP addresses">
                <TagInput
                  {...field}
                  id="IP addresses"
                  error={form.formState.errors.ips?.message}
                  placeholder="Exclude IP addresses"
                  value={field.value}
                  onChange={field.onChange}
                />
              </WithLabel>
            )}
          />

          <Controller
            name="profileIds"
            control={form.control}
            render={({ field }) => (
              <WithLabel label="Profile IDs">
                <TagInput
                  {...field}
                  id="Profile IDs"
                  error={form.formState.errors.profileIds?.message}
                  placeholder="Exclude Profile IDs"
                  value={field.value}
                  onChange={field.onChange}
                />
              </WithLabel>
            )}
          />

          <WithLabel label="Event rules">
            <div className="space-y-3">
              {eventRules.map((rule, index) => (
                <EventRuleItem
                  // biome-ignore lint/suspicious/noArrayIndexKey: order is stable
                  key={index}
                  projectId={project.id}
                  rule={rule}
                  onChange={(updated) => updateEventRule(index, updated)}
                  onRemove={() => removeEventRule(index)}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addEventRule}
                icon={PlusIcon}
              >
                Add event rule
              </Button>
            </div>
          </WithLabel>

          <Button
            loading={mutation.isPending}
            type="submit"
            icon={SaveIcon}
            className="self-end"
          >
            Save
          </Button>
        </form>
      </WidgetBody>
    </Widget>
  );
}
