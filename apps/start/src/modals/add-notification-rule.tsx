import type { RouterOutputs } from '@/trpc/client';

import { SheetContent } from '@/components/ui/sheet';
import { useQueryClient } from '@tanstack/react-query';

import { toast } from 'sonner';
import { popModal } from '.';
import { ModalHeader } from './Modal/Container';

import { ColorSquare } from '@/components/color-square';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { Textarea } from '@/components/ui/textarea';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventNames } from '@/hooks/use-event-names';
import { useEventProperties } from '@/hooks/use-event-properties';
import { useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { shortId } from '@openpanel/common';
import { zCreateNotificationRule } from '@openpanel/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  FilterIcon,
  PlusIcon,
  SaveIcon,
  TrashIcon,
} from 'lucide-react';
import {
  Controller,
  type SubmitHandler,
  type UseFormReturn,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';
import type { z } from 'zod';

interface Props {
  rule?: RouterOutputs['notification']['rules'][number];
  reportId?: string;
  projectId?: string;
}

type IForm = z.infer<typeof zCreateNotificationRule>;

export default function AddNotificationRule({
  rule,
  reportId: initialReportId,
}: Props) {
  const client = useQueryClient();
  const { organizationId, projectId } = useAppParams();
  const trpc = useTRPC();

  const getDefaultConfig = (): IForm['config'] => {
    if (rule?.config) return rule.config;
    if (initialReportId) {
      return {
        type: 'threshold',
        reportId: initialReportId,
        operator: 'above',
        value: 0,
        frequency: 'day',
      };
    }
    return {
      type: 'events',
      events: [
        {
          name: '',
          segment: 'event',
          filters: [],
        },
      ],
    };
  };

  const form = useForm<IForm>({
    resolver: zodResolver(zCreateNotificationRule),
    defaultValues: {
      id: rule?.id ?? '',
      name: rule?.name ?? '',
      sendToApp: rule?.sendToApp ?? false,
      sendToEmail: rule?.sendToEmail ?? false,
      integrations:
        rule?.integrations.map((integration) => integration.id) ?? [],
      projectId,
      template: rule?.template ?? '',
      config: getDefaultConfig(),
    },
  });

  const configType = useWatch({ control: form.control, name: 'config.type' });

  const mutation = useMutation(
    trpc.notification.createOrUpdateRule.mutationOptions({
      onSuccess() {
        toast.success(
          rule ? 'Notification rule updated' : 'Notification rule created',
        );
        client.refetchQueries(
          trpc.notification.rules.queryFilter({
            projectId,
          }),
        );
        popModal();
      },
    }),
  );
  const integrationsQuery = useQuery(
    trpc.integration.list.queryOptions({
      organizationId: organizationId!,
    }),
  );

  const reportsQuery = useQuery(
    trpc.report.listByProject.queryOptions({
      projectId,
    }),
  );

  const eventsArray = useFieldArray({
    control: form.control,
    name: 'config.events',
  });

  const onSubmit: SubmitHandler<IForm> = (data) => {
    if (
      (data.config.type === 'events' || data.config.type === 'funnel') &&
      !data.config.events[0]?.name
    ) {
      toast.error('At least one event is required');
      return;
    }
    mutation.mutate(data);
  };

  const integrations = integrationsQuery.data ?? [];
  const reports = (reportsQuery.data ?? []) as { id: string; name: string }[];

  const isAlertType = configType === 'threshold' || configType === 'anomaly';

  return (
    <SheetContent className="[&>button.absolute]:hidden">
      <ModalHeader title={rule ? 'Edit rule' : 'Create rule'} />
      <form onSubmit={form.handleSubmit(onSubmit)} className="col gap-4">
        <InputWithLabel
          label="Rule name"
          placeholder="Eg. Sign ups on android"
          error={form.formState.errors.name?.message}
          {...form.register('name')}
        />

        <WithLabel
          label="Type"
          // @ts-expect-error
          error={form.formState.errors.config?.type.message}
        >
          <Controller
            control={form.control}
            name="config.type"
            render={({ field }) => (
              <Combobox
                {...field}
                onChange={(value) => {
                  field.onChange(value);
                  // Reset config when type changes
                  if (value === 'threshold') {
                    form.setValue('config', {
                      type: 'threshold',
                      reportId: initialReportId ?? '',
                      operator: 'above',
                      value: 0,
                      frequency: 'day',
                    });
                  } else if (value === 'anomaly') {
                    form.setValue('config', {
                      type: 'anomaly',
                      reportId: initialReportId ?? '',
                      confidence: '95',
                      frequency: 'day',
                    });
                  } else if (value === 'events') {
                    form.setValue('config', {
                      type: 'events',
                      events: [{ name: '', segment: 'event', filters: [] }],
                    });
                  } else if (value === 'funnel') {
                    form.setValue('config', {
                      type: 'funnel',
                      events: [{ name: '', segment: 'event', filters: [] }],
                    });
                  }
                }}
                className="w-full"
                placeholder="Select type"
                // @ts-expect-error
                error={form.formState.errors.config?.type.message}
                items={[
                  { label: 'Events', value: 'events' },
                  { label: 'Funnel', value: 'funnel' },
                  { label: 'Threshold', value: 'threshold' },
                  { label: 'Anomaly', value: 'anomaly' },
                ]}
              />
            )}
          />
        </WithLabel>

        {/* Events/Funnel fields */}
        {(configType === 'events' || configType === 'funnel') && (
          <>
            <WithLabel label="Events">
              <div className="col gap-2">
                {eventsArray.fields.map((field, index) => {
                  return (
                    <EventField
                      key={field.id}
                      form={form}
                      index={index}
                      remove={() => eventsArray.remove(index)}
                    />
                  );
                })}
                <Button
                  className="self-start"
                  variant={'outline'}
                  icon={PlusIcon}
                  onClick={() =>
                    eventsArray.append({
                      name: '',
                      filters: [],
                      segment: 'event',
                    })
                  }
                >
                  Add event
                </Button>
              </div>
            </WithLabel>

            <WithLabel
              label="Template"
              info={
                <div className="prose dark:prose-invert">
                  <p>
                    Customize your notification message. You can grab any
                    property from your event.
                  </p>

                  <ul>
                    <li>
                      <code>{'{{name}}'}</code> - The name of the event
                    </li>
                    <li>
                      <code>{'{{rule_name}}'}</code> - The name of the rule
                    </li>
                    <li>
                      <code>{'{{properties.your.property}}'}</code> - Get the
                      value of a custom property
                    </li>
                    <li>
                      <code>{'{{profile.firstName}}'}</code> - Get the value of
                      a profile property
                    </li>
                    <li>
                      <div className="flex gap-x-2 flex-wrap">
                        And many more...
                        <code>profileId</code>
                        <code>createdAt</code>
                        <code>country</code>
                        <code>city</code>
                        <code>os</code>
                        <code>osVersion</code>
                        <code>browser</code>
                        <code>browserVersion</code>
                        <code>device</code>
                        <code>brand</code>
                        <code>model</code>
                        <code>path</code>
                        <code>origin</code>
                        <code>referrer</code>
                        <code>referrerName</code>
                        <code>referrerType</code>
                      </div>
                    </li>
                  </ul>
                </div>
              }
            >
              <Textarea
                {...form.register('template')}
                placeholder="You received a new '$EVENT_NAME' event"
              />
            </WithLabel>
          </>
        )}

        {/* Threshold fields */}
        {configType === 'threshold' && (
          <ThresholdFields
            form={form}
            reports={reports}
            lockedReportId={initialReportId}
          />
        )}

        {/* Anomaly fields */}
        {configType === 'anomaly' && (
          <AnomalyFields
            form={form}
            reports={reports}
            lockedReportId={initialReportId}
          />
        )}

        <Controller
          control={form.control}
          name="integrations"
          render={({ field }) => (
            <WithLabel label="Integrations">
              <ComboboxAdvanced
                {...field}
                value={field.value ?? []}
                className="w-full"
                placeholder="Pick integrations"
                items={integrations.map((integration) => ({
                  label: integration.name,
                  value: integration.id,
                }))}
              />
            </WithLabel>
          )}
        />

        <Button type="submit" icon={SaveIcon}>
          {rule ? 'Update' : 'Create'}
        </Button>
      </form>
    </SheetContent>
  );
}

function ThresholdFields({
  form,
  reports,
  lockedReportId,
}: {
  form: UseFormReturn<IForm>;
  reports: { id: string; name: string }[];
  lockedReportId?: string;
}) {
  return (
    <>
      <Controller
        control={form.control}
        name="config.reportId"
        render={({ field }) => (
          <WithLabel label="Report">
            <Combobox
              {...field}
              value={field.value as string}
              onChange={field.onChange}
              className="w-full"
              searchable
              placeholder="Select report"
              disabled={!!lockedReportId}
              items={reports.map((r) => ({ label: r.name, value: r.id }))}
            />
          </WithLabel>
        )}
      />
      <Controller
        control={form.control}
        name="config.operator"
        render={({ field }) => (
          <WithLabel label="Condition">
            <Combobox
              {...field}
              value={field.value as string}
              onChange={field.onChange}
              className="w-full"
              placeholder="Select condition"
              items={[
                { label: 'Above', value: 'above' },
                { label: 'Below', value: 'below' },
              ]}
            />
          </WithLabel>
        )}
      />
      <Controller
        control={form.control}
        name="config.value"
        render={({ field }) => (
          <InputWithLabel
            label="Threshold value"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 5000"
            value={field.value as number}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, '');
              field.onChange(val === '' ? 0 : Number(val));
            }}
          />
        )}
      />
      <Controller
        control={form.control}
        name="config.frequency"
        render={({ field }) => (
          <WithLabel label="Check frequency">
            <Combobox
              {...field}
              value={field.value as string}
              onChange={field.onChange}
              className="w-full"
              placeholder="Select frequency"
              items={[
                { label: 'Every hour', value: 'hour' },
                { label: 'Every day', value: 'day' },
                { label: 'Every week', value: 'week' },
                { label: 'Every month', value: 'month' },
              ]}
            />
          </WithLabel>
        )}
      />
    </>
  );
}

function AnomalyFields({
  form,
  reports,
  lockedReportId,
}: {
  form: UseFormReturn<IForm>;
  reports: { id: string; name: string }[];
  lockedReportId?: string;
}) {
  const frequency = useWatch({
    control: form.control,
    name: 'config.frequency',
  });

  return (
    <>
      <Controller
        control={form.control}
        name="config.reportId"
        render={({ field }) => (
          <WithLabel label="Report">
            <Combobox
              {...field}
              value={field.value as string}
              onChange={field.onChange}
              className="w-full"
              searchable
              placeholder="Select report"
              disabled={!!lockedReportId}
              items={reports.map((r) => ({ label: r.name, value: r.id }))}
            />
          </WithLabel>
        )}
      />
      <Controller
        control={form.control}
        name="config.confidence"
        render={({ field }) => (
          <WithLabel label="Confidence level">
            <Combobox
              {...field}
              value={field.value as string}
              onChange={field.onChange}
              className="w-full"
              placeholder="Select confidence"
              items={[
                { label: '95%', value: '95' },
                { label: '98%', value: '98' },
                { label: '99%', value: '99' },
              ]}
            />
          </WithLabel>
        )}
      />
      <Controller
        control={form.control}
        name="config.frequency"
        render={({ field }) => (
          <WithLabel label="Check frequency">
            <Combobox
              {...field}
              value={field.value as string}
              onChange={field.onChange}
              className="w-full"
              placeholder="Select frequency"
              items={[
                { label: 'Every hour', value: 'hour' },
                { label: 'Every day', value: 'day' },
                { label: 'Every week', value: 'week' },
                { label: 'Every month', value: 'month' },
              ]}
            />
          </WithLabel>
        )}
      />
      {frequency === 'hour' && (
        <div className="flex items-center gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
          <AlertTriangleIcon className="size-4 shrink-0" />
          Hourly checks may result in more false positives
        </div>
      )}
    </>
  );
}

function EventField({
  form,
  index,
  remove,
}: {
  form: UseFormReturn<IForm>;
  index: number;
  remove: () => void;
}) {
  const { projectId } = useAppParams();
  const eventNames = useEventNames({ projectId });
  const filtersArray = useFieldArray({
    control: form.control,
    name: `config.events.${index}.filters`,
  });
  const eventName = useWatch({
    control: form.control,
    name: `config.events.${index}.name`,
  });
  const properties = useEventProperties({ projectId });

  return (
    <div className="border bg-def-100 rounded">
      <div className="row gap-2 items-center p-2">
        <ColorSquare>{index + 1}</ColorSquare>
        <Controller
          control={form.control}
          name={`config.events.${index}.name`}
          render={({ field }) => (
            <ComboboxEvents
              searchable
              className="flex-1"
              value={field.value}
              placeholder="Select event"
              onChange={field.onChange}
              items={eventNames}
            />
          )}
        />
        <Combobox
          searchable
          placeholder="Select a filter"
          value=""
          items={properties.map((item) => ({
            label: item,
            value: item,
          }))}
          onChange={(value) => {
            filtersArray.append({
              id: shortId(),
              name: value,
              operator: 'is',
              value: [],
            });
          }}
        >
          <Button variant={'outline'} icon={FilterIcon} size={'icon'} />
        </Combobox>
        <Button
          onClick={() => {
            remove();
          }}
          variant={'outline'}
          className="text-destructive"
          icon={TrashIcon}
          size={'icon'}
        />
      </div>
      {filtersArray.fields.map((filter, index) => {
        return (
          <div key={filter.id} className="p-2 border-t">
            <PureFilterItem
              eventName={eventName}
              filter={filter}
              onRemove={() => {
                filtersArray.remove(index);
              }}
              onChangeValue={(value) => {
                filtersArray.update(index, {
                  ...filter,
                  value,
                });
              }}
              onChangeOperator={(operator) => {
                filtersArray.update(index, {
                  ...filter,
                  operator,
                });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
