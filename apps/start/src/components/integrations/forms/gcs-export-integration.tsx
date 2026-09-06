import { zodResolver } from '@hookform/resolvers/zod';
import { zCreateGCSExportIntegration } from '@openpanel/core/modules/integration/integration.constants';
import { useMutation } from '@tanstack/react-query';
import { mergeDeepRight, path } from 'ramda';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';

type IForm = z.infer<typeof zCreateGCSExportIntegration>;

export function GCSExportIntegrationForm({
  defaultValues,
  onSuccess,
}: {
  defaultValues?: RouterOutputs['integration']['get'];
  onSuccess: () => void;
}) {
  const { projectId } = useAppParams();
  const form = useForm<IForm>({
    defaultValues: mergeDeepRight(
      {
        id: defaultValues?.id,
        projectId,
        name: '',
        config: {
          type: 'gcs_export' as const,
          bucket: '',
          prefix: 'openpanel-exports',
          format: 'jsonl_gzip' as const,
          serviceAccountKey: '',
        },
      },
      defaultValues ?? {}
    ),
    resolver: zodResolver(zCreateGCSExportIntegration),
  });
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.integration.createOrUpdateExport.mutationOptions({
      onSuccess,
      onError(error) {
        toast.error(error.message || 'Failed to create integration');
      },
    })
  );

  const testMutation = useMutation(
    trpc.integration.testExportConnection.mutationOptions({
      onSuccess(data) {
        if (data.success) {
          toast.success('Connection successful! Bucket is accessible.');
        } else {
          toast.error(`Connection failed: ${data.error}`);
        }
      },
      onError(error) {
        toast.error(error.message || 'Failed to test connection');
      },
    })
  );

  const handleSubmit = (values: IForm) => {
    mutation.mutate(values);
  };

  const handleError = () => {
    toast.error('Please fix validation errors');
  };

  const handleTest = () => {
    const values = form.getValues();
    if (!(values.config.bucket && values.config.serviceAccountKey)) {
      return toast.error('Bucket and Service Account Key are required');
    }
    testMutation.mutate(values);
  };

  return (
    <form
      className="col gap-4"
      onSubmit={form.handleSubmit(handleSubmit, handleError)}
    >
      <InputWithLabel
        label="Name"
        placeholder="Eg. Production GCS Export"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />

      <div className="grid grid-cols-2 gap-4">
        <InputWithLabel
          label="GCS Bucket"
          placeholder="my-analytics-bucket"
          {...form.register('config.bucket')}
          error={path(['config', 'bucket', 'message'], form.formState.errors)}
        />
        <InputWithLabel
          label="Prefix"
          placeholder="openpanel-exports"
          {...form.register('config.prefix')}
          error={path(['config', 'prefix', 'message'], form.formState.errors)}
        />
      </div>

      <div className="col gap-1.5">
        <label className="font-medium text-sm">Format</label>
        <Controller
          control={form.control}
          name="config.format"
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jsonl_gzip">JSONL (gzip)</SelectItem>
                <SelectItem disabled value="parquet">
                  Parquet (coming soon)
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="col gap-1.5">
        <label className="font-medium text-sm">
          Service Account Key (JSON)
        </label>
        <textarea
          className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder={
            defaultValues?.id
              ? 'Leave blank to keep the current key'
              : '{"type": "service_account", "project_id": "...", ...}'
          }
          // Stored secrets are never sent back to the browser, so an edit starts
          // blank and blank means "keep the stored key".
          {...form.register('config.serviceAccountKey')}
        />
        {!!path(
          ['config', 'serviceAccountKey', 'message'],
          form.formState.errors
        ) && (
          <p className="text-destructive text-xs">
            {
              path(
                ['config', 'serviceAccountKey', 'message'],
                form.formState.errors
              ) as any
            }
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Paste the contents of your GCS service account JSON key file (a
          document with <code>"type": "service_account"</code>). The service
          account needs write access to the specified bucket.
        </p>
      </div>

      <div className="row gap-4">
        <Button
          disabled={testMutation.isPending}
          onClick={handleTest}
          type="button"
          variant="outline"
        >
          {testMutation.isPending ? 'Testing...' : 'Test connection'}
        </Button>
        <Button className="flex-1" disabled={mutation.isPending} type="submit">
          {mutation.isPending
            ? 'Saving...'
            : defaultValues?.id
              ? 'Update'
              : 'Create'}
        </Button>
      </div>
    </form>
  );
}
