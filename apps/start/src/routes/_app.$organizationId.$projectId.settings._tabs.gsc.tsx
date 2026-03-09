import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircleIcon, Loader2Icon, XCircleIcon } from 'lucide-react';
import { useState } from 'react';
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
        toast.error('Failed to initiate Google Search Console connection');
      },
    })
  );

  const selectSite = useMutation(
    trpc.gsc.selectSite.mutationOptions({
      onSuccess: () => {
        toast.success('Site connected', {
          description: 'Backfill of 6 months of data has started.',
        });
        queryClient.invalidateQueries(trpc.gsc.getConnection.pathFilter());
      },
      onError: () => {
        toast.error('Failed to select site');
      },
    })
  );

  const disconnect = useMutation(
    trpc.gsc.disconnect.mutationOptions({
      onSuccess: () => {
        toast.success('Disconnected from Google Search Console');
        queryClient.invalidateQueries(trpc.gsc.getConnection.pathFilter());
      },
      onError: () => {
        toast.error('Failed to disconnect');
      },
    })
  );

  const connection = connectionQuery.data;

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
          <h3 className="font-medium text-lg">Google Search Console</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            Connect your Google Search Console property to import search
            performance data.
          </p>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border p-6">
          <p className="text-muted-foreground text-sm">
            You will be redirected to Google to authorize access. Only read-only
            access to Search Console data is requested.
          </p>
          <Button
            className="w-fit"
            disabled={initiateOAuth.isPending}
            onClick={() => initiateOAuth.mutate({ projectId })}
          >
            {initiateOAuth.isPending && (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            )}
            Connect Google Search Console
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
          <h3 className="font-medium text-lg">Select a property</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            Choose which Google Search Console property to connect to this
            project.
          </p>
        </div>
        <div className="space-y-4 rounded-lg border p-6">
          {sitesQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : sites.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No Search Console properties found for this Google account.
            </p>
          ) : (
            <>
              <Select onValueChange={setSelectedSite} value={selectedSite}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a property..." />
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
                Connect property
              </Button>
            </>
          )}
        </div>
        <Button
          onClick={() => disconnect.mutate({ projectId })}
          size="sm"
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
    );
  }

  // Token expired — show reconnect prompt
  if (connection.lastSyncStatus === 'token_expired') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="font-medium text-lg">Google Search Console</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            Connected to Google Search Console.
          </p>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-destructive/50 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 text-destructive">
            <XCircleIcon className="h-4 w-4" />
            <span className="font-medium text-sm">Authorization expired</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Your Google Search Console authorization has expired or been
            revoked. Please reconnect to continue syncing data.
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
            Reconnect Google Search Console
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
          Disconnect
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
        <h3 className="font-medium text-lg">Google Search Console</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          Connected to Google Search Console.
        </p>
      </div>

      <div className="divide-y rounded-lg border">
        <div className="flex items-center justify-between p-4">
          <div className="font-medium text-sm">Property</div>
          <div className="font-mono text-muted-foreground text-sm">
            {connection.siteUrl}
          </div>
        </div>

        {connection.backfillStatus && (
          <div className="flex items-center justify-between p-4">
            <div className="font-medium text-sm">Backfill</div>
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
            <div className="font-medium text-sm">Last synced</div>
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
                })}
              </span>
            </div>
          </div>
        )}

        {connection.lastSyncError && (
          <div className="p-4">
            <div className="font-medium text-destructive text-sm">
              Last error
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
        Disconnect
      </Button>
    </div>
  );
}
