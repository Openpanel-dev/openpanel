import { zodResolver } from '@hookform/resolvers/zod';
import type {
  IProjectFilterEvent,
  IProjectFilterIp,
  IProjectFilterProfileId,
} from '@openpanel/core/modules/project/project.constants';
import { zProjectFilterEvent } from '@openpanel/core/modules/project/project.constants';
import type {
  IChartEventFilter,
  IChartEventFilterOperator,
  IChartEventFilterValue,
} from '@openpanel/core/modules/report/report.constants';
import { shortId } from '@openpanel/shared';
import { useMutation } from '@tanstack/react-query';
import { PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
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
  const eventNames = useEventNames({ projectId, anyEvents: true });

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
    filter: IChartEventFilter
  ) => {
    onChange({
      ...rule,
      filters: rule.filters.map((f) =>
        f.id === filter.id ? { ...f, value } : f
      ),
    });
  };

  const changeFilterOperator = (
    operator: IChartEventFilterOperator,
    filter: IChartEventFilter
  ) => {
    onChange({
      ...rule,
      filters: rule.filters.map((f) =>
        f.id === filter.id
          ? { ...f, operator, value: f.value.filter(Boolean).slice(0, 1) }
          : f
      ),
    });
  };

  return (
    <div className="rounded-lg border bg-def-100">
      <div className="flex items-center gap-2 p-4">
        <div className="flex-1">
          <ComboboxEvents
            className="w-full"
            items={eventNames}
            onChange={(name) => onChange({ ...rule, name })}
            placeholder="Select event name..."
            searchable
            value={rule.name}
          />
        </div>
        <Button onClick={onRemove} size="icon" variant="ghost">
          <Trash2Icon size={16} />
        </Button>
      </div>

      {rule.filters.length > 0 && (
        <>
          {rule.filters.map((filter) => (
            <PureFilterItem
              className="border-t border-l-2 border-l-emerald-500 p-2 px-4"
              eventName={rule.name}
              filter={filter}
              immediateInput
              key={filter.id}
              onChangeOperator={changeFilterOperator}
              onChangeValue={changeFilterValue}
              onRemove={removeFilter}
            />
          ))}
        </>
      )}
      <div className="border-t p-4">
        <PropertiesCombobox categories={['event']} onSelect={addFilter}>
          {(setOpen) => (
            <Button
              icon={PlusIcon}
              onClick={() => setOpen(true)}
              size="sm"
              variant="outline"
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
          (item): item is IProjectFilterProfileId => item.type === 'profile_id'
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
    })
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
      eventRules.filter((_, i) => i !== index)
    );
  };

  return (
    <Widget className="w-full max-w-screen-md">
      <WidgetHead className="space-y-2">
        <span className="title">Exclude events</span>
        <p className="text-muted-foreground">
          Exclude events from being tracked by adding filters.
        </p>
      </WidgetHead>
      <WidgetBody>
        <form
          className="space-y-4"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
              e.preventDefault();
            }
          }}
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <Controller
            control={form.control}
            name="ips"
            render={({ field }) => (
              <WithLabel label="IP addresses">
                <TagInput
                  {...field}
                  error={form.formState.errors.ips?.message}
                  id="IP addresses"
                  onChange={field.onChange}
                  placeholder="Exclude IP addresses"
                  value={field.value}
                />
              </WithLabel>
            )}
          />

          <Controller
            control={form.control}
            name="profileIds"
            render={({ field }) => (
              <WithLabel label="Profile IDs">
                <TagInput
                  {...field}
                  error={form.formState.errors.profileIds?.message}
                  id="Profile IDs"
                  onChange={field.onChange}
                  placeholder="Exclude Profile IDs"
                  value={field.value}
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
                  onChange={(updated) => updateEventRule(index, updated)}
                  onRemove={() => removeEventRule(index)}
                  projectId={project.id}
                  rule={rule}
                />
              ))}
              <Button
                icon={PlusIcon}
                onClick={addEventRule}
                size="sm"
                type="button"
                variant="outline"
              >
                Add event rule
              </Button>
            </div>
          </WithLabel>

          <Button
            className="self-end"
            icon={SaveIcon}
            loading={mutation.isPending}
            type="submit"
          >
            Save
          </Button>
        </form>
      </WidgetBody>
    </Widget>
  );
}
