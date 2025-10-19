import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { ProjectMapper } from '@/components/project-mapper';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import type {
  IImportConfig,
  IMixpanelImportConfig,
  IUmamiImportConfig,
} from '@openpanel/validation';
import {
  zMixpanelImportConfig,
  zUmamiImportConfig,
} from '@openpanel/validation';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { popModal, pushModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type Provider = 'umami' | 'plausible' | 'mixpanel';

interface AddImportProps {
  provider: Provider;
  name: string;
  types: ('file' | 'api')[];
}

type UmamiFormData = z.infer<typeof zUmamiImportConfig>;
type MixpanelFormData = z.infer<typeof zMixpanelImportConfig>;

interface UmamiImportProps {
  onSubmit: (config: IUmamiImportConfig) => void;
  isPending: boolean;
  organizationId: string;
}

function UmamiImport({
  onSubmit,
  isPending,
  organizationId,
}: UmamiImportProps) {
  const trpc = useTRPC();
  const { data: projects = [] } = useQuery(
    trpc.project.list.queryOptions({
      organizationId,
    }),
  );

  const form = useForm<UmamiFormData>({
    resolver: zodResolver(zUmamiImportConfig),
    defaultValues: {
      provider: 'umami',
      type: 'file',
      fileUrl: '',
      projectMapper: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'projectMapper',
  });

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4 py-4">
        <InputWithLabel
          label="File URL"
          placeholder="https://example.com/export.csv"
          error={form.formState.errors.fileUrl?.message}
          info="Provide a publicly accessible URL to your exported CSV file."
          {...form.register('fileUrl')}
        />

        <ProjectMapper
          fields={fields}
          append={append}
          remove={remove}
          projects={projects}
          register={form.register}
          watch={form.watch}
          setValue={form.setValue}
        />
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={() => popModal()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Starting...' : 'Start Import'}
        </Button>
      </div>
    </form>
  );
}

interface MixpanelImportProps {
  onSubmit: (config: IMixpanelImportConfig) => void;
  isPending: boolean;
  organizationId: string;
}

function MixpanelImport({
  onSubmit,
  isPending,
  organizationId,
}: MixpanelImportProps) {
  const trpc = useTRPC();
  const form = useForm<MixpanelFormData>({
    resolver: zodResolver(zMixpanelImportConfig),
    defaultValues: {
      provider: 'mixpanel',
      type: 'api',
      serviceAccount: '',
      serviceSecret: '',
      projectId: '',
      from: '',
      to: '',
    },
  });

  const handleDateRangeSelect = () => {
    pushModal('DateRangerPicker', {
      startDate: form.getValues('from')
        ? new Date(form.getValues('from'))
        : undefined,
      endDate: form.getValues('to')
        ? new Date(form.getValues('to'))
        : undefined,
      onChange: ({ startDate, endDate }) => {
        form.setValue('from', format(startDate, 'yyyy-MM-dd'));
        form.setValue('to', format(endDate, 'yyyy-MM-dd'));
        form.trigger('from');
        form.trigger('to');
      },
    });
  };

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4 py-4">
        <InputWithLabel
          label="Service Account"
          placeholder="Eg. xxx.xxx.mp-service-account"
          error={form.formState.errors.serviceAccount?.message}
          {...form.register('serviceAccount')}
        />

        <InputWithLabel
          label="Service Secret"
          type="password"
          placeholder="Your Mixpanel service secret"
          error={form.formState.errors.serviceSecret?.message}
          {...form.register('serviceSecret')}
        />

        <InputWithLabel
          label="Project ID"
          placeholder="Your Mixpanel project ID"
          error={form.formState.errors.projectId?.message}
          {...form.register('projectId')}
        />

        <WithLabel
          label="Date Range"
          info={
            !form.getValues('from') || !form.getValues('to')
              ? 'Select the date range for importing data'
              : undefined
          }
        >
          <Button
            type="button"
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              (!form.getValues('from') || !form.getValues('to')) &&
                'text-muted-foreground',
            )}
            onClick={handleDateRangeSelect}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {form.getValues('from') && form.getValues('to') ? (
              <>
                {format(new Date(form.getValues('from')), 'LLL dd, y')} -{' '}
                {format(new Date(form.getValues('to')), 'LLL dd, y')}
              </>
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </WithLabel>

        <InputWithLabel
          label="Screen View Property"
          placeholder="Enter the name of the property that contains the screen name"
          info="Leave empty if not applicable"
          error={form.formState.errors.mapScreenViewProperty?.message}
          {...form.register('mapScreenViewProperty')}
        />
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={() => popModal()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Starting...' : 'Start Import'}
        </Button>
      </div>
    </form>
  );
}

export default function AddImport({ provider, name }: AddImportProps) {
  const { projectId, organizationId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createImport = useMutation(
    trpc.import.create.mutationOptions({
      onSuccess() {
        toast.success('Import started', {
          description: 'Your data import has been queued for processing.',
        });
        popModal();
        queryClient.invalidateQueries(trpc.import.list.pathFilter());
      },
      onError: (error) => {
        toast.error('Import failed', {
          description: error.message,
        });
      },
    }),
  );

  const handleImportSubmit = (config: IImportConfig) => {
    createImport.mutate({
      projectId,
      provider: config.provider,
      config,
    });
  };

  return (
    <ModalContent>
      <ModalHeader title={`Import from ${name}`} />

      {provider === 'umami' && (
        <UmamiImport
          onSubmit={handleImportSubmit}
          isPending={createImport.isPending}
          organizationId={organizationId}
        />
      )}

      {provider === 'mixpanel' && (
        <MixpanelImport
          onSubmit={handleImportSubmit}
          isPending={createImport.isPending}
          organizationId={organizationId}
        />
      )}
    </ModalContent>
  );
}
