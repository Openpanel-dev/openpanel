import { IMPORT_PROVIDERS } from '@openpanel/importer/providers';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircleIcon,
  Download,
  InfoIcon,
  Loader2Icon,
  XCircleIcon,
} from 'lucide-react';
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
        toast.success('Import deleted', {
          description: 'The import has been successfully deleted.',
        });
        queryClient.invalidateQueries(trpc.import.list.pathFilter());
      },
    })
  );

  const retryImport = useMutation(
    trpc.import.retry.mutationOptions({
      onSuccess: () => {
        toast.success('Import retried', {
          description: 'The import has been queued for processing again.',
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

  return (
    <div className="space-y-8">
      <div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {IMPORT_PROVIDERS.map((provider) => (
            <IntegrationCard
              description={provider.description}
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
                  Import Data
                </Button>
              </IntegrationCardFooter>
            </IntegrationCard>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-4 font-medium text-lg">Import History</h3>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Config</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!importsQuery.isLoading && imports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <FullPageEmptyState
                      description="Your import history will appear here."
                      title="No imports yet"
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
                            content="Estimated number of events. Can be inaccurate depending on the provider."
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
                      <Badge>Config</Badge>
                    </Tooltiper>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {imp.status === 'failed' && (
                      <Button
                        onClick={() => retryImport.mutate({ id: imp.id })}
                        size="sm"
                        variant="outline"
                      >
                        Retry
                      </Button>
                    )}
                    <Button
                      onClick={() => deleteImport.mutate({ id: imp.id })}
                      size="sm"
                      variant="ghost"
                    >
                      Delete
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
