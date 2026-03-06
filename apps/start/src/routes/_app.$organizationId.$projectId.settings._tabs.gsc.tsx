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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircleIcon, Loader2Icon, XCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

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
        // Route through the API /gsc/initiate endpoint which sets cookies then redirects to Google
        const apiUrl = (import.meta.env.VITE_API_URL as string) ?? '';
        const initiateUrl = new URL(`${apiUrl}/gsc/initiate`);
        initiateUrl.searchParams.set('state', data.state);
        initiateUrl.searchParams.set('code_verifier', data.codeVerifier);
        initiateUrl.searchParams.set('project_id', data.projectId);
        initiateUrl.searchParams.set('redirect', data.url);
        window.location.href = initiateUrl.toString();
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
          <h3 className="text-lg font-medium">Google Search Console</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your Google Search Console property to import search performance data.
          </p>
        </div>
        <div className="rounded-lg border p-6 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            You will be redirected to Google to authorize access. Only read-only access to Search Console data is requested.
          </p>
          <Button
            className="w-fit"
            onClick={() => initiateOAuth.mutate({ projectId })}
            disabled={initiateOAuth.isPending}
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
          <h3 className="text-lg font-medium">Select a property</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which Google Search Console property to connect to this project.
          </p>
        </div>
        <div className="rounded-lg border p-6 space-y-4">
          {sitesQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Search Console properties found for this Google account.
            </p>
          ) : (
            <>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
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
                onClick={() => selectSite.mutate({ projectId, siteUrl: selectedSite })}
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
          variant="ghost"
          size="sm"
          onClick={() => disconnect.mutate({ projectId })}
        >
          Cancel
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
        <h3 className="text-lg font-medium">Google Search Console</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Connected to Google Search Console.
        </p>
      </div>

      <div className="rounded-lg border divide-y">
        <div className="p-4 flex items-center justify-between">
          <div className="text-sm font-medium">Property</div>
          <div className="font-mono text-sm text-muted-foreground">
            {connection.siteUrl}
          </div>
        </div>

        {connection.backfillStatus && (
          <div className="p-4 flex items-center justify-between">
            <div className="text-sm font-medium">Backfill</div>
            <Badge className="capitalize" variant={
              connection.backfillStatus === 'completed' ? 'success' :
              connection.backfillStatus === 'failed' ? 'destructive' :
              connection.backfillStatus === 'running' ? 'default' : 'secondary'
            }>
              {connection.backfillStatus === 'running' && (
                <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
              )}
              {connection.backfillStatus}
            </Badge>
          </div>
        )}

        {connection.lastSyncedAt && (
          <div className="p-4 flex items-center justify-between">
            <div className="text-sm font-medium">Last synced</div>
            <div className="flex items-center gap-2">
              {connection.lastSyncStatus && (
                <Badge className="capitalize" variant={syncStatusVariant as any}>
                  {syncStatusIcon}
                  {connection.lastSyncStatus}
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(connection.lastSyncedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        )}

        {connection.lastSyncError && (
          <div className="p-4">
            <div className="text-sm font-medium text-destructive">Last error</div>
            <div className="mt-1 text-sm text-muted-foreground font-mono break-words">
              {connection.lastSyncError}
            </div>
          </div>
        )}
      </div>

      <Button
        variant="destructive"
        size="sm"
        onClick={() => disconnect.mutate({ projectId })}
        disabled={disconnect.isPending}
      >
        {disconnect.isPending && (
          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
        )}
        Disconnect
      </Button>
    </div>
  );
}
