import { IMPORT_PROVIDERS } from '@openpanel/importer/providers';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN, zhTW } from 'date-fns/locale';
import {
  CheckCircleIcon,
  Download,
  InfoIcon,
  Loader2Icon,
  XCircleIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import {
  IntegrationCard,
  IntegrationCardFooter,
  IntegrationCardLogoImage,
} from '@/components/integrations/integration-card';
import { Skeleton } from '@/components/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltiper } from '@/components/ui/tooltip';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/imports'
)({
  component: ImportsSettings,
});

function ImportsSettings() {
  const { i18n, t } = useTranslation();
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const importsQuery = useQuery(
    trpc.import.list.queryOptions(
      { projectId },
      {
        refetchInterval: 5000,
      }
    )
  );
  const imports = importsQuery.data ?? [];

  const deleteImport = useMutation(
    trpc.import.delete.mutationOptions({
      onSuccess: () => {
        toast.success(t('settings.imports_deleted_toast'), {
          description: t('settings.imports_deleted_description'),
        });
        queryClient.invalidateQueries(trpc.import.list.pathFilter());
      },
    })
  );

  const retryImport = useMutation(
    trpc.import.retry.mutationOptions({
      onSuccess: () => {
        toast.success(t('settings.imports_retried_toast'), {
          description: t('settings.imports_retried_description'),
        });
        queryClient.invalidateQueries(trpc.import.list.pathFilter());
      },
    })
  );

  const handleProviderSelect = (
    provider: (typeof IMPORT_PROVIDERS)[number]
  ) => {
    pushModal('AddImport', {
      provider: provider.id,
      name: provider.name,
      types: provider.types,
    });
  };

  const getStatusBadge = (status: string, errorMessage: string | null) => {
    const variants: Record<string, any> = {
      pending: 'secondary',
      processing: 'default',
      completed: 'success',
      failed: 'destructive',
    };
    const icons: Record<string, React.ReactNode> = {
      pending: <Loader2Icon className="h-4 w-4 animate-spin" />,
      processing: <Loader2Icon className="h-4 w-4 animate-spin" />,
      completed: <CheckCircleIcon className="h-4 w-4" />,
      failed: <XCircleIcon className="h-4 w-4" />,
    };

    if (status === 'failed') {
      return (
        <Tooltiper
          content={errorMessage}
          tooltipClassName="max-w-xs break-words"
        >
          <Badge className="capitalize" variant={variants[status] || 'default'}>
            {icons[status] || null}
            {status}
          </Badge>
        </Tooltiper>
      );
    }

    return (
      <Badge className="capitalize" variant={variants[status] || 'default'}>
        {icons[status] || null}
        {status}
      </Badge>
    );
  };

  const dateLocale =
    (i18n.resolvedLanguage ?? i18n.language) === 'zh-CN'
      ? zhCN
      : (i18n.resolvedLanguage ?? i18n.language) === 'zh-TW'
        ? zhTW
        : enUS;

  return (
    <div className="space-y-8">
      <div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {IMPORT_PROVIDERS.map((provider) => (
            <IntegrationCard
              description={t(
                `settings.imports_provider_${provider.id}_description`,
              )}
              icon={
                <IntegrationCardLogoImage
                  backgroundColor={provider.backgroundColor}
                  className="p-4"
                  src={provider.logo}
                />
              }
              key={provider.id}
              name={provider.name}
            >
              <IntegrationCardFooter className="row justify-end">
                <Button
                  onClick={() => handleProviderSelect(provider)}
                  variant="ghost"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t('settings.imports_import_data_button')}
                </Button>
              </IntegrationCardFooter>
            </IntegrationCard>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-4 font-medium text-lg">
          {t('settings.imports_history_title')}
        </h3>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.imports_provider_column')}</TableHead>
                <TableHead>{t('settings.imports_created_column')}</TableHead>
                <TableHead>{t('settings.imports_status_column')}</TableHead>
                <TableHead>{t('settings.imports_progress_column')}</TableHead>
                <TableHead>{t('settings.imports_config_column')}</TableHead>
                <TableHead className="text-right">
                  {t('settings.imports_actions_column')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!importsQuery.isLoading && imports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <FullPageEmptyState
                      description={t('settings.imports_empty_description')}
                      title={t('settings.imports_empty_title')}
                    />
                  </TableCell>
                </TableRow>
              )}
              {importsQuery.isLoading &&
                [1, 2, 3, 4].map((index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Skeleton className="h-4 w-3/5" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-3/5" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-3/5" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-3/5" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-3/5" />
                    </TableCell>
                    <TableCell className="row justify-end text-right">
                      <Skeleton className="h-4 w-3/5" />
                    </TableCell>
                  </TableRow>
                ))}
              {imports.map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell className="font-medium capitalize">
                    <div className="row items-center gap-2">
                      <div>{imp.config.provider}</div>
                      <Badge className="uppercase" variant="outline">
                        {imp.config.type}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(imp.createdAt), {
                      addSuffix: true,
                      locale: dateLocale,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {getStatusBadge(imp.status, imp.errorMessage)}
                      {imp.statusMessage && (
                        <div className="truncate text-muted-foreground text-xs">
                          {imp.statusMessage}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {imp.totalEvents > 0 ? (
                      <div className="space-y-1 font-mono">
                        <div className="text-sm">
                          {imp.processedEvents.toLocaleString()}
                          {' / '}
                          <Tooltiper
                            content={t(
                              'settings.imports_estimated_events_tooltip',
                            )}
                            tooltipClassName="max-w-xs"
                          >
                            {imp.totalEvents.toLocaleString()}{' '}
                            <InfoIcon className="relative -top-px inline-block h-4 w-4" />
                          </Tooltiper>
                        </div>
                        {imp.status === 'processing' && (
                          <div className="h-1.5 w-full rounded-full bg-secondary">
                            <div
                              className="h-1.5 rounded-full bg-primary transition-all"
                              style={{
                                width: `${Math.min(Math.round((imp.processedEvents / imp.totalEvents) * 100), 100)}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ) : imp.totalEvents === -1 ? (
                      <div className="font-mono text-sm">
                        {imp.processedEvents.toLocaleString()}
                        {' / '}
                        N/A
                      </div>
                    ) : (
                      '-'
                    )}
                  </TableCell>

                  <TableCell>
                    <Tooltiper
                      content={
                        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-normal">
                          {JSON.stringify(imp.config, null, 2)}
                        </pre>
                      }
                      tooltipClassName="max-w-xs"
                    >
                      <Badge>{t('settings.imports_config_badge')}</Badge>
                    </Tooltiper>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {imp.status === 'failed' && (
                      <Button
                        onClick={() => retryImport.mutate({ id: imp.id })}
                        size="sm"
                        variant="outline"
                      >
                        {t('settings.imports_retry_button')}
                      </Button>
                    )}
                    <Button
                      onClick={() => deleteImport.mutate({ id: imp.id })}
                      size="sm"
                      variant="ghost"
                    >
                      {t('settings.imports_delete_button')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
