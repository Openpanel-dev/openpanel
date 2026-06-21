import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN, zhTW } from 'date-fns/locale';
import { CheckCircleIcon, Loader2Icon, XCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Skeleton } from '@/components/skeleton';
import { Badge } from '@/components/ui/badge';
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

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/gsc'
)({
  component: GscSettings,
});

function GscSettings() {
  const { i18n, t } = useTranslation();
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selectedSite, setSelectedSite] = useState('');

  const connectionQuery = useQuery(
    trpc.gsc.getConnection.queryOptions(
      { projectId },
      { refetchInterval: 5000 }
    )
  );

  const sitesQuery = useQuery(
    trpc.gsc.getSites.queryOptions(
      { projectId },
      { enabled: !!connectionQuery.data && !connectionQuery.data.siteUrl }
    )
  );

  const initiateOAuth = useMutation(
    trpc.gsc.initiateOAuth.mutationOptions({
      onSuccess: (data) => {
        window.location.href = data.url;
      },
      onError: () => {
        toast.error(t('settings.gsc_initiate_failed_toast'));
      },
    })
  );

  const selectSite = useMutation(
    trpc.gsc.selectSite.mutationOptions({
      onSuccess: () => {
        toast.success(t('settings.gsc_site_connected_toast'), {
          description: t('settings.gsc_backfill_started_toast'),
        });
        queryClient.invalidateQueries(trpc.gsc.getConnection.pathFilter());
      },
      onError: () => {
        toast.error(t('settings.gsc_select_failed_toast'));
      },
    })
  );

  const disconnect = useMutation(
    trpc.gsc.disconnect.mutationOptions({
      onSuccess: () => {
        toast.success(t('settings.gsc_disconnected_toast'));
        queryClient.invalidateQueries(trpc.gsc.getConnection.pathFilter());
      },
      onError: () => {
        toast.error(t('settings.gsc_disconnect_failed_toast'));
      },
    })
  );

  const connection = connectionQuery.data;
  const dateLocale =
    (i18n.resolvedLanguage ?? i18n.language) === 'zh-CN'
      ? zhCN
      : (i18n.resolvedLanguage ?? i18n.language) === 'zh-TW'
        ? zhTW
        : enUS;

  if (connectionQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // Not connected at all
  if (!connection) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="font-medium text-lg">{t('settings.gsc_title')}</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('settings.gsc_connect_description')}
          </p>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border p-6">
          <p className="text-muted-foreground text-sm">
            {t('settings.gsc_authorize_description')}
          </p>
          <Button
            className="w-fit"
            disabled={initiateOAuth.isPending}
            onClick={() => initiateOAuth.mutate({ projectId })}
          >
            {initiateOAuth.isPending && (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('settings.gsc_connect_button')}
          </Button>
        </div>
      </div>
    );
  }

  // Connected but no site selected yet
  if (!connection.siteUrl) {
    const sites = sitesQuery.data ?? [];
    return (
      <div className="space-y-6">
        <div>
          <h3 className="font-medium text-lg">
            {t('settings.gsc_select_property_title')}
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('settings.gsc_select_property_description')}
          </p>
        </div>
        <div className="space-y-4 rounded-lg border p-6">
          {sitesQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : sites.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('settings.gsc_no_properties')}
            </p>
          ) : (
            <>
              <Select onValueChange={setSelectedSite} value={selectedSite}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('settings.gsc_select_property_placeholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.siteUrl} value={site.siteUrl}>
                      {site.siteUrl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!selectedSite || selectSite.isPending}
                onClick={() =>
                  selectSite.mutate({ projectId, siteUrl: selectedSite })
                }
              >
                {selectSite.isPending && (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('settings.gsc_connect_property_button')}
              </Button>
            </>
          )}
        </div>
        <Button
          onClick={() => disconnect.mutate({ projectId })}
          size="sm"
          variant="ghost"
        >
          {t('settings.gsc_cancel_button')}
        </Button>
      </div>
    );
  }

  // Token expired — show reconnect prompt
  if (connection.lastSyncStatus === 'token_expired') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="font-medium text-lg">{t('settings.gsc_title')}</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('settings.gsc_connected_description')}
          </p>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-destructive/50 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 text-destructive">
            <XCircleIcon className="h-4 w-4" />
            <span className="font-medium text-sm">
              {t('settings.gsc_authorization_expired')}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            {t('settings.gsc_authorization_expired_description')}
          </p>
          {connection.lastSyncError && (
            <p className="break-words font-mono text-muted-foreground text-xs">
              {connection.lastSyncError}
            </p>
          )}
          <Button
            className="w-fit"
            disabled={initiateOAuth.isPending}
            onClick={() => initiateOAuth.mutate({ projectId })}
          >
            {initiateOAuth.isPending && (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('settings.gsc_reconnect_button')}
          </Button>
        </div>
        <Button
          disabled={disconnect.isPending}
          onClick={() => disconnect.mutate({ projectId })}
          size="sm"
          variant="ghost"
        >
          {disconnect.isPending && (
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
          )}
          {t('settings.gsc_disconnect_button')}
        </Button>
      </div>
    );
  }

  // Fully connected
  const syncStatusIcon =
    connection.lastSyncStatus === 'success' ? (
      <CheckCircleIcon className="h-4 w-4" />
    ) : connection.lastSyncStatus === 'error' ? (
      <XCircleIcon className="h-4 w-4" />
    ) : null;

  const syncStatusVariant =
    connection.lastSyncStatus === 'success'
      ? 'success'
      : connection.lastSyncStatus === 'error'
        ? 'destructive'
        : 'secondary';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-lg">{t('settings.gsc_title')}</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('settings.gsc_connected_description')}
        </p>
      </div>

      <div className="divide-y rounded-lg border">
        <div className="flex items-center justify-between p-4">
          <div className="font-medium text-sm">
            {t('settings.gsc_property_label')}
          </div>
          <div className="font-mono text-muted-foreground text-sm">
            {connection.siteUrl}
          </div>
        </div>

        {connection.backfillStatus && (
          <div className="flex items-center justify-between p-4">
            <div className="font-medium text-sm">
              {t('settings.gsc_backfill_label')}
            </div>
            <Badge
              className="capitalize"
              variant={
                connection.backfillStatus === 'completed'
                  ? 'success'
                  : connection.backfillStatus === 'failed'
                    ? 'destructive'
                    : connection.backfillStatus === 'running'
                      ? 'default'
                      : 'secondary'
              }
            >
              {connection.backfillStatus === 'running' && (
                <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
              )}
              {connection.backfillStatus}
            </Badge>
          </div>
        )}

        {connection.lastSyncedAt && (
          <div className="flex items-center justify-between p-4">
            <div className="font-medium text-sm">
              {t('settings.gsc_last_synced_label')}
            </div>
            <div className="flex items-center gap-2">
              {connection.lastSyncStatus && (
                <Badge
                  className="capitalize"
                  variant={syncStatusVariant as any}
                >
                  {syncStatusIcon}
                  {connection.lastSyncStatus}
                </Badge>
              )}
              <span className="text-muted-foreground text-sm">
                {formatDistanceToNow(new Date(connection.lastSyncedAt), {
                  addSuffix: true,
                  locale: dateLocale,
                })}
              </span>
            </div>
          </div>
        )}

        {connection.lastSyncError && (
          <div className="p-4">
            <div className="font-medium text-destructive text-sm">
              {t('settings.gsc_last_error_label')}
            </div>
            <div className="mt-1 break-words font-mono text-muted-foreground text-sm">
              {connection.lastSyncError}
            </div>
          </div>
        )}
      </div>

      <Button
        disabled={disconnect.isPending}
        onClick={() => disconnect.mutate({ projectId })}
        size="sm"
        variant="destructive"
      >
        {disconnect.isPending && (
          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
        )}
        {t('settings.gsc_disconnect_button')}
      </Button>
    </div>
  );
}
