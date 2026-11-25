import { zodResolver } from '@hookform/resolvers/zod';
import type {
  IAmplitudeImportConfig,
  IImportConfig,
  IMixpanelImportConfig,
  IUmamiImportConfig,
} from '@openpanel/core/modules/import/import.constants';
import {
  zAmplitudeImportConfig,
  zMixpanelImportConfig,
  zUmamiImportConfig,
} from '@openpanel/core/modules/import/import.constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { popModal, pushModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { ProjectMapper } from '@/components/project-mapper';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppParams } from '@/hooks/use-app-params';
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/lib/utils';

type Provider = 'umami' | 'plausible' | 'mixpanel' | 'amplitude';

interface AddImportProps {
  provider: Provider;
  name: string;
  types: ('file' | 'api')[];
}

type UmamiFormData = z.infer<typeof zUmamiImportConfig>;
type MixpanelFormData = z.infer<typeof zMixpanelImportConfig>;
type AmplitudeFormData = z.infer<typeof zAmplitudeImportConfig>;

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
  const { t: translateUi } = useDashboardTranslation();

  const trpc = useTRPC();
  const { data: projects = [] } = useQuery(
    trpc.project.list.queryOptions({
      organizationId,
    })
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
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-4 py-4">
        <InputWithLabel
          error={form.formState.errors.fileUrl?.message}
          info="Provide a publicly accessible URL to your exported CSV file."
          label={translateUi('File URL')}
          placeholder="https://example.com/export.csv"
          {...form.register('fileUrl')}
        />

        <ProjectMapper
          append={append}
          fields={fields}
          projects={projects}
          register={form.register}
          remove={remove}
          setValue={form.setValue}
          watch={form.watch}
        />
      </div>

      <div className="flex justify-between">
        <Button onClick={() => popModal()} type="button" variant="outline">
          <DashboardText i18nKey={'Cancel'} />{' '}
        </Button>
        <Button disabled={isPending} type="submit">
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
  const { t: translateUi } = useDashboardTranslation();

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
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-4 py-4">
        <InputWithLabel
          error={form.formState.errors.serviceAccount?.message}
          label={translateUi('Service Account')}
          placeholder={translateUi('Eg. xxx.xxx.mp-service-account')}
          {...form.register('serviceAccount')}
        />

        <InputWithLabel
          error={form.formState.errors.serviceSecret?.message}
          label={translateUi('Service Secret')}
          placeholder={translateUi('Your Mixpanel service secret')}
          type="password"
          {...form.register('serviceSecret')}
        />

        <InputWithLabel
          error={form.formState.errors.projectId?.message}
          label={translateUi('Project ID')}
          placeholder={translateUi('Your Mixpanel project ID')}
          {...form.register('projectId')}
        />

        <WithLabel
          info={
            form.getValues('from') && form.getValues('to')
              ? undefined
              : 'Select the date range for importing data'
          }
          label={translateUi('Date Range')}
        >
          <Button
            className={cn(
              'w-full justify-start text-left font-normal',
              !(form.getValues('from') && form.getValues('to')) &&
                'text-muted-foreground'
            )}
            onClick={handleDateRangeSelect}
            type="button"
            variant="outline"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {form.getValues('from') && form.getValues('to') ? (
              <>
                {format(new Date(form.getValues('from')), 'LLL dd, y')} -{' '}
                {format(new Date(form.getValues('to')), 'LLL dd, y')}
              </>
            ) : (
              <span>
                <DashboardText i18nKey={'Pick a date range'} />
              </span>
            )}
          </Button>
        </WithLabel>

        <InputWithLabel
          error={form.formState.errors.mapScreenViewProperty?.message}
          info="Leave empty if not applicable"
          label={translateUi('Screen View Property')}
          placeholder={translateUi(
            'Enter the name of the property that contains the screen name'
          )}
          {...form.register('mapScreenViewProperty')}
        />

        <WithLabel
          info="Select the Mixpanel data center your project uses"
          label={translateUi('Data Residency')}
        >
          <Select
            onValueChange={(value) =>
              form.setValue('dataResidency', value as 'us' | 'eu' | 'in')
            }
            value={form.watch('dataResidency') ?? 'us'}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={translateUi('US (default)')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="us">
                <DashboardText i18nKey={'US (default)'} />
              </SelectItem>
              <SelectItem value="eu">
                <DashboardText i18nKey={'EU'} />
              </SelectItem>
              <SelectItem value="in">
                <DashboardText i18nKey={'India'} />
              </SelectItem>
            </SelectContent>
          </Select>
        </WithLabel>
      </div>

      <div className="flex justify-between">
        <Button onClick={() => popModal()} type="button" variant="outline">
          <DashboardText i18nKey={'Cancel'} />{' '}
        </Button>
        <Button disabled={isPending} type="submit">
          {isPending ? 'Starting...' : 'Start Import'}
        </Button>
      </div>
    </form>
  );
}

interface AmplitudeImportProps {
  onSubmit: (config: IAmplitudeImportConfig) => void;
  isPending: boolean;
  organizationId: string;
}

function AmplitudeImport({ onSubmit, isPending }: AmplitudeImportProps) {
  const { t: translateUi } = useDashboardTranslation();

  const form = useForm<AmplitudeFormData>({
    resolver: zodResolver(zAmplitudeImportConfig),
    defaultValues: {
      provider: 'amplitude',
      type: 'api',
      apiKey: '',
      secretKey: '',
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
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-4 py-4">
        <InputWithLabel
          error={form.formState.errors.apiKey?.message}
          info="Settings → Projects → General in Amplitude."
          label={translateUi('API Key')}
          placeholder={translateUi('Your Amplitude API key')}
          {...form.register('apiKey')}
        />

        <InputWithLabel
          error={form.formState.errors.secretKey?.message}
          label={translateUi('Secret Key')}
          placeholder={translateUi('Your Amplitude secret key')}
          type="password"
          {...form.register('secretKey')}
        />

        <WithLabel
          info={
            form.getValues('from') && form.getValues('to')
              ? undefined
              : 'Select the date range for importing data'
          }
          label={translateUi('Date Range')}
        >
          <Button
            className={cn(
              'w-full justify-start text-left font-normal',
              !(form.getValues('from') && form.getValues('to')) &&
                'text-muted-foreground'
            )}
            onClick={handleDateRangeSelect}
            type="button"
            variant="outline"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {form.getValues('from') && form.getValues('to') ? (
              <>
                {format(new Date(form.getValues('from')), 'LLL dd, y')} -{' '}
                {format(new Date(form.getValues('to')), 'LLL dd, y')}
              </>
            ) : (
              <span>
                <DashboardText i18nKey={'Pick a date range'} />
              </span>
            )}
          </Button>
        </WithLabel>

        <InputWithLabel
          error={form.formState.errors.mapScreenViewProperty?.message}
          info="Leave empty if not applicable"
          label={translateUi('Screen View Property')}
          placeholder={translateUi(
            'Enter the name of the property that contains the screen name'
          )}
          {...form.register('mapScreenViewProperty')}
        />

        <WithLabel
          info="Select the Amplitude data region your project uses"
          label={translateUi('Data Residency')}
        >
          <Select
            onValueChange={(value) =>
              form.setValue('dataResidency', value as 'us' | 'eu')
            }
            value={form.watch('dataResidency') ?? 'us'}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={translateUi('US (default)')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="us">
                <DashboardText i18nKey={'US (default)'} />
              </SelectItem>
              <SelectItem value="eu">
                <DashboardText i18nKey={'EU'} />
              </SelectItem>
            </SelectContent>
          </Select>
        </WithLabel>
      </div>

      <div className="flex justify-between">
        <Button onClick={() => popModal()} type="button" variant="outline">
          <DashboardText i18nKey={'Cancel'} />{' '}
        </Button>
        <Button disabled={isPending} type="submit">
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
    })
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
          isPending={createImport.isPending}
          onSubmit={handleImportSubmit}
          organizationId={organizationId}
        />
      )}

      {provider === 'mixpanel' && (
        <MixpanelImport
          isPending={createImport.isPending}
          onSubmit={handleImportSubmit}
          organizationId={organizationId}
        />
      )}

      {provider === 'amplitude' && (
        <AmplitudeImport
          isPending={createImport.isPending}
          onSubmit={handleImportSubmit}
          organizationId={organizationId}
        />
      )}
    </ModalContent>
  );
}
