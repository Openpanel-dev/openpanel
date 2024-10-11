'use client';

import { type RouterOutputs, api } from '@/trpc/client';

import { SheetContent } from '@/components/ui/sheet';
import type { NotificationRule } from '@openpanel/db';
import { useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalHeader } from './Modal/Container';

import { ColorSquare } from '@/components/color-square';
import { CheckboxItem } from '@/components/forms/checkbox-item';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { useAppParams } from '@/hooks/useAppParams';
import { useEventNames } from '@/hooks/useEventNames';
import { useEventProperties } from '@/hooks/useEventProperties';
import { zodResolver } from '@hookform/resolvers/zod';
import { shortId } from '@openpanel/common';
import {
  IChartEvent,
  type IChartRange,
  type IInterval,
  zCreateNotificationRule,
} from '@openpanel/validation';
import {
  FilterIcon,
  PlusIcon,
  SaveIcon,
  SmartphoneIcon,
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
}

type IForm = z.infer<typeof zCreateNotificationRule>;

export default function AddNotificationRule({ rule }: Props) {
  const client = useQueryClient();
  const { organizationId, projectId } = useAppParams();
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
      config: rule?.config ?? {
        type: 'events',
        events: [
          {
            name: '',
            segment: 'event',
            filters: [],
          },
        ],
      },
    },
  });
  const mutation = api.notification.createOrUpdateRule.useMutation({
    onSuccess() {
      toast.success(
        rule ? 'Notification rule updated' : 'Notification rule created',
      );
      client.refetchQueries(
        getQueryKey(api.notification.rules, {
          projectId,
        }),
      );
      popModal();
    },
  });

  const eventsArray = useFieldArray({
    control: form.control,
    name: 'config.events',
  });

  const onSubmit: SubmitHandler<IForm> = (data) => {
    mutation.mutate(data);
  };

  const integrationsQuery = api.integration.list.useQuery({
    organizationId,
  });
  const integrations = integrationsQuery.data ?? [];

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
                className="w-full"
                placeholder="Select type"
                // @ts-expect-error
                error={form.formState.errors.config?.type.message}
                items={[
                  {
                    label: 'Events',
                    value: 'events',
                  },
                  {
                    label: 'Funnel',
                    value: 'funnel',
                  },
                ]}
              />
            )}
          />
        </WithLabel>
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

const interval: IInterval = 'day';
const range: IChartRange = 'lastMonth';

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
  const eventNames = useEventNames({ projectId, interval, range });
  const filtersArray = useFieldArray({
    control: form.control,
    name: `config.events.${index}.filters`,
  });
  const eventName = useWatch({
    control: form.control,
    name: `config.events.${index}.name`,
  });
  const properties = useEventProperties({ projectId, interval, range });

  return (
    <div className="border bg-def-100 rounded">
      <div className="row gap-2 items-center p-2">
        <ColorSquare>{index + 1}</ColorSquare>
        <Controller
          control={form.control}
          name={`config.events.${index}.name`}
          render={({ field }) => (
            <Combobox
              searchable
              className="flex-1"
              value={field.value}
              placeholder="Select event"
              onChange={field.onChange}
              items={eventNames.map((item) => ({
                label: item.name,
                value: item.name,
              }))}
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
              range={range}
              startDate={null}
              endDate={null}
              interval={interval}
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
