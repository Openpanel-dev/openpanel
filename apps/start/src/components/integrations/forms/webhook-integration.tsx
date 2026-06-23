import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { JsonEditor } from '@/components/json-editor';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { zCreateWebhookIntegration } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { path, mergeDeepRight } from 'ramda';
import { useEffect } from 'react';
import { Controller, useFieldArray, useWatch } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';

type IForm = z.infer<typeof zCreateWebhookIntegration>;

const DEFAULT_TRANSFORMER = `(payload) => {
  return payload;
}`;

// Convert Record<string, string> to array format for form
function headersToArray(
  headers: Record<string, string> | undefined,
): { key: string; value: string }[] {
  if (!headers || Object.keys(headers).length === 0) {
    return [];
  }
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

// Convert array format back to Record<string, string> for API
function headersToRecord(
  headers: { key: string; value: string }[],
): Record<string, string> {
  return headers.reduce(
    (acc, { key, value }) => {
      if (key.trim()) {
        acc[key.trim()] = value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );
}

export function WebhookIntegrationForm({
  defaultValues,
  onSuccess,
}: {
  defaultValues?: RouterOutputs['integration']['get'];
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { organizationId } = useAppParams();

  // Convert headers from Record to array format for form UI
  const defaultHeaders =
    defaultValues?.config && 'headers' in defaultValues.config
      ? headersToArray(defaultValues.config.headers)
      : [];

  const form = useForm<IForm>({
    defaultValues: mergeDeepRight(
      {
        id: defaultValues?.id,
        organizationId,
        config: {
          type: 'webhook' as const,
          url: '',
          headers: {},
          mode: 'message' as const,
          javascriptTemplate: undefined,
        },
      },
      defaultValues ?? {},
    ),
    resolver: zodResolver(zCreateWebhookIntegration),
  });

  // Use a separate form for headers array to work with useFieldArray
  const headersForm = useForm<{ headers: { key: string; value: string }[] }>({
    defaultValues: {
      headers: defaultHeaders,
    },
  });

  const headersArray = useFieldArray({
    control: headersForm.control,
    name: 'headers',
  });

  // Watch headers array and sync to main form
  const watchedHeaders = useWatch({
    control: headersForm.control,
    name: 'headers',
  });

  // Sync headers array changes back to main form
  useEffect(() => {
    if (watchedHeaders) {
      const validHeaders = watchedHeaders.filter(
        (h): h is { key: string; value: string } =>
          h !== undefined &&
          typeof h.key === 'string' &&
          typeof h.value === 'string',
      );
      form.setValue('config.headers', headersToRecord(validHeaders), {
        shouldValidate: false,
      });
    }
  }, [watchedHeaders, form]);

  const mode = form.watch('config.mode');
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.integration.createOrUpdate.mutationOptions({
      onSuccess,
      onError(error) {
        // Handle validation errors from tRPC
        if (error.data?.code === 'BAD_REQUEST') {
          const errorMessage =
            error.message || t('integrations.error_invalid_javascript_template');
          toast.error(errorMessage);
          // Set form error if it's a JavaScript template error
          if (errorMessage.includes('JavaScript template')) {
            form.setError('config.javascriptTemplate', {
              type: 'manual',
              message: errorMessage,
            });
          }
        } else {
          toast.error(t('integrations.error_create_failed'));
        }
      },
    }),
  );

  const handleSubmit = (values: IForm) => {
    mutation.mutate(values);
  };

  const handleError = () => {
    toast.error(t('integrations.error_validation'));
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit, handleError)}
      className="col gap-4"
    >
      <InputWithLabel
        label={t('integrations.field_name')}
        placeholder={t('integrations.webhook_name_placeholder')}
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <InputWithLabel
        label={t('integrations.field_url')}
        {...form.register('config.url')}
        error={path(['config', 'url', 'message'], form.formState.errors)}
      />

      <WithLabel
        label={t('integrations.field_headers')}
        info={t('integrations.headers_help')}
      >
        <div className="col gap-2">
          {headersArray.fields.map((field, index) => (
            <div key={field.id} className="row gap-2">
              <Input
                placeholder={t('integrations.header_name_placeholder')}
                {...headersForm.register(`headers.${index}.key`)}
                className="flex-1"
              />
              <Input
                placeholder={t('integrations.header_value_placeholder')}
                {...headersForm.register(`headers.${index}.value`)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => headersArray.remove(index)}
                className="text-destructive"
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => headersArray.append({ key: '', value: '' })}
            className="self-start"
            icon={PlusIcon}
          >
            {t('integrations.action_add_header')}
          </Button>
        </div>
      </WithLabel>

      <Controller
        control={form.control}
        name="config.mode"
        render={({ field }) => (
          <WithLabel
            label={t('integrations.field_payload_format')}
            info={t('integrations.payload_format_help')}
          >
            <Combobox
              {...field}
              className="w-full"
              placeholder={t('integrations.payload_format_placeholder')}
              items={[
                {
                  label: t('integrations.payload_format_message'),
                  value: 'message' as const,
                },
                {
                  label: t('integrations.payload_format_javascript'),
                  value: 'javascript' as const,
                },
              ]}
              value={field.value ?? 'message'}
              onChange={field.onChange}
            />
          </WithLabel>
        )}
      />

      {mode === 'javascript' && (
        <Controller
          control={form.control}
          name="config.javascriptTemplate"
          render={({ field }) => (
            <WithLabel
              label={t('integrations.field_javascript_transform')}
              info={
                <div className="prose dark:prose-invert max-w-none">
                  <p>
                    <Trans
                      i18nKey="integrations.javascript_transform_help"
                      components={{ code: <code /> }}
                    />
                  </p>
                  <p className="text-sm font-semibold mt-2">
                    {t('integrations.available_payload_title')}
                  </p>
                  <ul className="text-sm">
                    <li>
                      <code>payload.name</code> -{' '}
                      {t('integrations.payload_name_description')}
                    </li>
                    <li>
                      <code>payload.profileId</code> -{' '}
                      {t('integrations.payload_profile_id_description')}
                    </li>
                    <li>
                      <code>payload.properties</code> -{' '}
                      {t('integrations.payload_properties_description')}
                    </li>
                    <li>
                      <code>payload.properties.your.property</code> -{' '}
                      {t('integrations.payload_nested_property_description')}
                    </li>
                    <li>
                      <code>payload.profile.firstName</code> -{' '}
                      {t('integrations.payload_profile_property_description')}
                    </li>
                    <li>
                      <div className="flex gap-x-2 flex-wrap mt-1">
                        <code>country</code>
                        <code>city</code>
                        <code>device</code>
                        <code>os</code>
                        <code>browser</code>
                        <code>path</code>
                        <code>createdAt</code>
                        {t('integrations.payload_more_fields')}
                      </div>
                    </li>
                  </ul>
                  <p className="text-sm font-semibold mt-2">
                    {t('integrations.available_helpers_title')}
                  </p>
                  <ul className="text-sm">
                    <li>
                      <code>Math</code>, <code>Date</code>, <code>JSON</code>,{' '}
                      <code>Array</code>, <code>String</code>,{' '}
                      <code>Object</code>
                    </li>
                  </ul>
                  <p className="text-sm mt-2">
                    <strong>{t('integrations.example_title')}</strong>
                  </p>
                  <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                    {`(payload) => ({
  event: payload.name,
  user: payload.profileId,
  data: payload.properties,
  timestamp: new Date(payload.createdAt).toISOString(),
  location: \`\${payload.city}, \${payload.country}\`
})`}
                  </pre>
                  <p className="text-sm mt-2 text-yellow-600 dark:text-yellow-400">
                    <strong>{t('integrations.security_title')}</strong>{' '}
                    {t('integrations.security_description')}
                  </p>
                </div>
              }
            >
              <JsonEditor
                value={field.value ?? DEFAULT_TRANSFORMER}
                onChange={(value) => {
                  field.onChange(value);
                  // Clear error when user starts typing
                  if (form.formState.errors.config?.javascriptTemplate) {
                    form.clearErrors('config.javascriptTemplate');
                  }
                }}
                placeholder={DEFAULT_TRANSFORMER}
                minHeight="300px"
                language="javascript"
              />
              {form.formState.errors.config?.javascriptTemplate && (
                <p className="mt-1 text-sm text-destructive">
                  {form.formState.errors.config.javascriptTemplate.message}
                </p>
              )}
            </WithLabel>
          )}
        />
      )}

      <Button type="submit">
        {defaultValues?.id
          ? t('integrations.action_update')
          : t('integrations.action_create')}
      </Button>
    </form>
  );
}
