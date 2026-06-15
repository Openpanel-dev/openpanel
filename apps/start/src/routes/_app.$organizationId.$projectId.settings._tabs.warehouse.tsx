import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircleIcon,
  DatabaseIcon,
  Loader2Icon,
  PlusIcon,
  XCircleIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  zGcpProjectId,
  zServiceAccountJson,
  zWarehouseConnectionCreate,
} from '@openpanel/validation';
import { Skeleton } from '@/components/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltiper } from '@/components/ui/tooltip';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/warehouse'
)({
  component: WarehouseSettings,
});

// Human-readable labels per provider — prepared for Snowflake, Redshift, etc.
const PROVIDER_LABELS: Record<string, string> = {
  bigquery: 'BigQuery',
  snowflake: 'Snowflake',
  redshift: 'Redshift',
  databricks: 'Databricks',
  postgres: 'PostgreSQL',
};

// Flat form schema — subset of zWarehouseConnectionCreate for the BigQuery add-connection UI.
// gcpRegion format is validated server-side only (zWarehouseRegion isn't exported).
const zAddConnectionForm = z.object({
  name: zWarehouseConnectionCreate.shape.name,
  gcpProjectId: zGcpProjectId,
  gcpRegion: z.string().optional(),
  serviceAccountJson: zServiceAccountJson,
});
type AddConnectionFormValues = z.infer<typeof zAddConnectionForm>;

type ConnectionRow = {
  id: string;
  name: string;
  type: string;
  displayIdentifier: string | null;
  displayEmail: string | null;
  lastTestedAt: Date | string | null;
  lastTestStatus: boolean | null;
  lastTestError: string | null;
  _count: { syncs: number };
};

function TestStatusBadge({
  status,
  testedAt,
}: {
  status: boolean | null;
  testedAt: Date | string | null;
}) {
  if (status === null || testedAt === null) {
    return (
      <Badge variant="secondary" className="gap-1">
        Never tested
      </Badge>
    );
  }
  if (status) {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircleIcon className="h-3 w-3" />
        {formatDistanceToNow(new Date(testedAt), { addSuffix: true })}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircleIcon className="h-3 w-3" />
      Failed
    </Badge>
  );
}

function AddConnectionDialog({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const form = useForm<AddConnectionFormValues>({
    resolver: zodResolver(zAddConnectionForm),
    defaultValues: {
      name: '',
      gcpProjectId: '',
      gcpRegion: '',
      serviceAccountJson: '',
    },
  });

  const connect = useMutation(
    trpc.warehouse.connect.mutationOptions({
      onSuccess: () => {
        toast.success('Connection added', {
          description: 'BigQuery connection verified and saved.',
        });
        queryClient.invalidateQueries(
          trpc.warehouse.listConnections.pathFilter(),
        );
        setOpen(false);
        form.reset();
      },
      onError: (err) => {
        toast.error('Connection failed', { description: err.message });
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Warehouse Connection</DialogTitle>
          <DialogDescription>
            Connect a data warehouse to sync events and profiles into OpenPanel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Provider selector */}
          <div className="space-y-2">
            <Label>Provider</Label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="default" className="gap-1">
                <DatabaseIcon className="h-3 w-3" />
                BigQuery
              </Button>
              {['Snowflake', 'Redshift', 'Databricks', 'Postgres'].map(
                (name) => (
                  <Tooltiper key={name} content="Coming soon">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="cursor-not-allowed opacity-50"
                    >
                      {name}
                    </Button>
                  </Tooltiper>
                ),
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="conn-name">Connection name</Label>
            <Input
              id="conn-name"
              placeholder="My Analytics BQ"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="gcp-project">GCP Project ID</Label>
              <Input
                id="gcp-project"
                placeholder="my-gcp-project"
                {...form.register('gcpProjectId')}
              />
              {form.formState.errors.gcpProjectId && (
                <p className="text-destructive text-xs">{form.formState.errors.gcpProjectId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="gcp-region">
                Region{' '}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="gcp-region"
                placeholder="US"
                {...form.register('gcpRegion')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sa-json">Service Account JSON</Label>
            <Textarea
              id="sa-json"
              placeholder='Paste the contents of your service account key file ({"type":"service_account",...})'
              className="h-32 font-mono text-xs"
              {...form.register('serviceAccountJson')}
            />
            {form.formState.errors.serviceAccountJson && (
              <p className="text-destructive text-xs">{form.formState.errors.serviceAccountJson.message}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={connect.isPending}
            onClick={form.handleSubmit((values) => {
              connect.mutate({
                projectId,
                name: values.name,
                config: {
                  type: 'bigquery',
                  gcpProjectId: values.gcpProjectId,
                  ...(values.gcpRegion ? { gcpRegion: values.gcpRegion } : {}),
                  serviceAccountJson: values.serviceAccountJson,
                },
              });
            })}
          >
            {connect.isPending && (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            )}
            Connect & Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RotateKeyDialog({
  connection,
  projectId,
}: {
  connection: ConnectionRow;
  projectId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saJson, setSaJson] = useState('');

  const update = useMutation(
    trpc.warehouse.updateConnection.mutationOptions({
      onSuccess: () => {
        toast.success('Credentials rotated', {
          description: 'New service account key verified and saved.',
        });
        queryClient.invalidateQueries(
          trpc.warehouse.listConnections.pathFilter(),
        );
        setOpen(false);
        setSaJson('');
      },
      onError: (err) => {
        toast.error('Rotation failed', { description: err.message });
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Rotate Key
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rotate Service Account Key</DialogTitle>
          <DialogDescription>
            Current account:{' '}
            <span className="font-mono text-xs">
              {connection.displayEmail ?? 'Unknown'}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="new-sa-json">New Service Account JSON</Label>
          <Textarea
            id="new-sa-json"
            placeholder='Paste the new service account key file contents'
            className="h-32 font-mono text-xs"
            value={saJson}
            onChange={(e) => setSaJson(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={update.isPending || !saJson.trim()}
            onClick={() => {
              if (!connection.displayIdentifier) return;
              update.mutate({
                connectionId: connection.id,
                projectId,
                config: {
                  type: 'bigquery',
                  gcpProjectId: connection.displayIdentifier,
                  serviceAccountJson: saJson,
                },
              });
            }}
          >
            {update.isPending && (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            )}
            Verify & Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionCard({
  connection,
  projectId,
}: {
  connection: ConnectionRow;
  projectId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const testConnection = useMutation(
    trpc.warehouse.testConnection.mutationOptions({
      onSuccess: () => {
        toast.success('Connection verified');
        queryClient.invalidateQueries(
          trpc.warehouse.listConnections.pathFilter(),
        );
      },
      onError: (err) => {
        toast.error('Connection test failed', { description: err.message });
        queryClient.invalidateQueries(
          trpc.warehouse.listConnections.pathFilter(),
        );
      },
    }),
  );

  const disconnect = useMutation(
    trpc.warehouse.disconnect.mutationOptions({
      onSuccess: () => {
        toast.success('Connection removed');
        queryClient.invalidateQueries(
          trpc.warehouse.listConnections.pathFilter(),
        );
      },
      onError: (err) => {
        toast.error('Failed to remove connection', { description: err.message });
      },
    }),
  );

  const syncCount = connection._count.syncs;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{connection.name}</span>
            <Badge variant="secondary" className="text-xs">
              {PROVIDER_LABELS[connection.type] ?? connection.type}
            </Badge>
          </div>
          <div className="text-muted-foreground text-xs font-mono truncate">
            {connection.displayIdentifier ?? 'Unknown project'}
          </div>
          {connection.displayEmail && (
            <div className="text-muted-foreground text-xs truncate">
              {connection.displayEmail}
            </div>
          )}
        </div>

        <TestStatusBadge
          status={connection.lastTestStatus}
          testedAt={connection.lastTestedAt}
        />
      </div>

      {connection.lastTestStatus === false && connection.lastTestError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-destructive text-xs">
          {connection.lastTestError}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          disabled={
            testConnection.isPending &&
            testConnection.variables?.connectionId === connection.id
          }
          onClick={() =>
            testConnection.mutate({
              connectionId: connection.id,
              projectId,
            })
          }
        >
          {testConnection.isPending &&
          testConnection.variables?.connectionId === connection.id ? (
            <Loader2Icon className="mr-2 h-3 w-3 animate-spin" />
          ) : null}
          Test
        </Button>

        <RotateKeyDialog connection={connection} projectId={projectId} />

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive">
              Disconnect
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove connection?</AlertDialogTitle>
              <AlertDialogDescription>
                {syncCount > 0
                  ? `This connection has ${syncCount} sync${syncCount === 1 ? '' : 's'} — removing it will permanently delete all syncs and run history.`
                  : 'This will permanently remove the connection.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  disconnect.mutate({
                    connectionId: connection.id,
                    projectId,
                  })
                }
              >
                {disconnect.isPending ? (
                  <Loader2Icon className="mr-2 h-3 w-3 animate-spin" />
                ) : null}
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function WarehouseSettings() {
  const { projectId } = useAppParams();
  const trpc = useTRPC();

  const connectionsQuery = useQuery(
    trpc.warehouse.listConnections.queryOptions({ projectId }),
  );

  if (connectionsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (connectionsQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-6 text-center text-sm text-destructive">
        Failed to load connections. Please refresh the page.
      </div>
    );
  }

  const connections = connectionsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-lg">Warehouse Sources</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            Sync events and profiles from your data warehouse into OpenPanel.
          </p>
        </div>
        <AddConnectionDialog projectId={projectId} />
      </div>

      {connections.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <DatabaseIcon className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium text-sm">No connections yet</p>
            <p className="mt-1 text-muted-foreground text-sm">
              Add a BigQuery connection to start syncing warehouse data.
            </p>
          </div>
          <AddConnectionDialog projectId={projectId} />
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              projectId={projectId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
