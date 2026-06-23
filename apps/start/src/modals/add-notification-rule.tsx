import { zodResolver } from '@hookform/resolvers/zod';
import { shortId } from '@openpanel/common';
import { zCreateNotificationRule } from '@openpanel/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilterIcon, PlusIcon, SaveIcon, TrashIcon } from 'lucide-react';
import {
  Controller,
  type SubmitHandler,
  type UseFormReturn,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { popModal } from '.';
import { ModalHeader } from './Modal/Container';
import { ColorSquare } from '@/components/color-square';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { PureFilterItem } from '@/components/report/sidebar/filters/FilterItem';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { SheetContent } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventNames } from '@/hooks/use-event-names';
import { useEventProperties } from '@/hooks/use-event-properties';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';

interface Props {
  rule?: RouterOutputs['notification']['rules'][number];
}

type IForm = z.infer<typeof zCreateNotificationRule>;

export default function AddNotificationRule({ rule }: Props) {
  const { t } = useTranslation();
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
      template: rule?.template ?? '',
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
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.notification.createOrUpdateRule.mutationOptions({
      onSuccess() {
        toast.success(
          rule
            ? t('notifications.rule_updated')
            : t('notifications.rule_created'),
        );
        client.refetchQueries(
          trpc.notification.rules.queryFilter({
            projectId,
          })
        );
        popModal();
      },
    })
  );
  const integrationsQuery = useQuery(
    trpc.integration.list.queryOptions({
      organizationId: organizationId!,
    })
  );

  const eventsArray = useFieldArray({
    control: form.control,
    name: 'config.events',
  });

  const onSubmit: SubmitHandler<IForm> = (data) => {
    if (!data.config.events[0]?.name) {
      toast.error(t('notifications.event_required'));
      return;
    }
    mutation.mutate(data);
  };

  const integrations = integrationsQuery.data ?? [];

  return (
    <SheetContent className="[&>button.absolute]:hidden">
      <ModalHeader
        title={
          rule ? t('notifications.edit_rule') : t('notifications.create_rule')
        }
      />
      <form className="col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        <InputWithLabel
          error={form.formState.errors.name?.message}
          label={t('notifications.rule_name')}
          placeholder={t('notifications.rule_name_placeholder')}
          {...form.register('name')}
        />

        <WithLabel
          // @ts-expect-error
          error={form.formState.errors.config?.type.message}
          label={t('notifications.type')}
        >
          <Controller
            control={form.control}
            name="config.type"
            render={({ field }) => (
              <Combobox
                {...field}
                className="w-full"
                // @ts-expect-error
                error={form.formState.errors.config?.type.message}
                items={[
                  {
                    label: t('notifications.type_events'),
                    value: 'events',
                  },
                  {
                    label: t('notifications.type_funnel'),
                    value: 'funnel',
                  },
                ]}
                placeholder={t('notifications.select_type')}
              />
            )}
          />
        </WithLabel>
        <WithLabel label={t('notifications.events')}>
          <div className="col gap-2">
            {eventsArray.fields.map((field, index) => {
              return (
                <EventField
                  form={form}
                  index={index}
                  key={field.id}
                  remove={() => eventsArray.remove(index)}
                />
              );
            })}
            <Button
              className="self-start"
              icon={PlusIcon}
              onClick={() =>
                eventsArray.append({
                  name: '',
                  filters: [],
                  segment: 'event',
                })
              }
              variant={'outline'}
            >
              {t('notifications.add_event')}
            </Button>
          </div>
        </WithLabel>

        <WithLabel
          info={
            <div className="prose dark:prose-invert">
              <p>{t('notifications.template_help_description')}</p>

              <ul>
                <li>
                  <code>{'{{name}}'}</code> -{' '}
                  {t('notifications.template_help_name')}
                </li>
                <li>
                  <code>{'{{rule_name}}'}</code> -{' '}
                  {t('notifications.template_help_rule_name')}
                </li>
                <li>
                  <code>{'{{properties.your.property}}'}</code> -{' '}
                  {t('notifications.template_help_custom_property')}
                </li>
                <li>
                  <code>{'{{profile.firstName}}'}</code> -{' '}
                  {t('notifications.template_help_profile_property')}
                </li>
                <li>
                  <div className="flex flex-wrap gap-x-2">
                    {t('notifications.template_help_more')}
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
          label={t('notifications.template')}
        >
          <Textarea
            {...form.register('template')}
            placeholder={t('notifications.template_placeholder')}
          />
        </WithLabel>

        <Controller
          control={form.control}
          name="integrations"
          render={({ field }) => (
            <WithLabel label={t('notifications.integrations')}>
              <ComboboxAdvanced
                {...field}
                className="w-full"
                items={integrations.map((integration) => ({
                  label: integration.name,
                  value: integration.id,
                }))}
                placeholder={t('notifications.pick_integrations')}
                value={field.value ?? []}
              />
            </WithLabel>
          )}
        />

        <Button icon={SaveIcon} type="submit">
          {rule ? t('common.update') : t('common.create')}
        </Button>
      </form>
    </SheetContent>
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
  const { t } = useTranslation();
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
    <div className="rounded border bg-def-100">
      <div className="row items-center gap-2 p-2">
        <ColorSquare>{index + 1}</ColorSquare>
        <Controller
          control={form.control}
          name={`config.events.${index}.name`}
          render={({ field }) => (
            <ComboboxEvents
              className="flex-1"
              items={eventNames}
              onChange={field.onChange}
              placeholder={t('notifications.select_event')}
              searchable
              value={field.value}
            />
          )}
        />
        <Combobox
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
          placeholder={t('notifications.select_filter')}
          searchable
          value=""
        >
          <Button icon={FilterIcon} size={'icon'} variant={'outline'} />
        </Combobox>
        <Button
          className="text-destructive"
          icon={TrashIcon}
          onClick={() => {
            remove();
          }}
          size={'icon'}
          variant={'outline'}
        />
      </div>
      {filtersArray.fields.map((filter, index) => {
        return (
          <div className="border-t p-2" key={filter.id}>
            <PureFilterItem
              eventName={eventName}
              filter={filter}
              onChangeOperator={(operator) => {
                filtersArray.update(index, {
                  ...filter,
                  operator,
                });
              }}
              onChangeValue={(value) => {
                filtersArray.update(index, {
                  ...filter,
                  value,
                });
              }}
              onRemove={() => {
                filtersArray.remove(index);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
