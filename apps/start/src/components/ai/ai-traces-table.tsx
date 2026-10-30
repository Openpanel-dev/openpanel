import type { IServiceAiTrace } from '@openpanel/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { AlertTriangleIcon, BotIcon, CheckIcon } from 'lucide-react';
import { useMemo } from 'react';
import { formatCost, formatLatency, formatTokens } from './ai-format';
import { ColumnCreatedAt } from '@/components/column-created-at';
import { ProjectLink } from '@/components/links';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table/data-table';
import { useAiFilters } from '@/hooks/use-ai-filters';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { getProfileName } from '@/utils/getters';

const PAGE_SIZE = 50;
const MODELS_SHOWN = 2;

export function ProfileCell({
  profile,
  profileId,
  deviceId,
}: {
  profile?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string;
    isExternal: boolean;
  };
  profileId: string;
  deviceId: string;
}) {
  if (!profileId || profileId === deviceId) {
    return <span className="text-muted-foreground">Anonymous</span>;
  }
  return (
    <ProjectLink
      className="row min-w-0 items-center gap-2 font-medium hover:underline"
      onClick={(event) => event.stopPropagation()}
      params={{ profileId }}
      to="/profiles/$profileId"
    >
      <ProfileAvatar size="xs" {...profile} />
      <span className="truncate">
        {profile ? getProfileName(profile, false) : profileId}
      </span>
    </ProjectLink>
  );
}

function useColumns(): ColumnDef<IServiceAiTrace>[] {
  return useMemo(
    () => [
      {
        accessorKey: 'startedAt',
        header: 'Started',
        size: ColumnCreatedAt.size,
        cell: ({ row }) => (
          <ColumnCreatedAt>{row.original.startedAt}</ColumnCreatedAt>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Trace',
        size: 220,
        cell: ({ row }) => (
          <div className="col min-w-0">
            <span className="truncate font-medium">
              {row.original.name || 'trace'}
            </span>
            <span className="truncate font-mono text-2xs text-muted-foreground">
              {row.original.id}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'profileId',
        header: 'Profile',
        size: 180,
        cell: ({ row }) => (
          <ProfileCell
            deviceId={row.original.deviceId}
            profile={row.original.profile}
            profileId={row.original.profileId}
          />
        ),
      },
      {
        accessorKey: 'models',
        header: 'Models',
        size: 220,
        cell: ({ row }) => (
          <div className="row flex-wrap gap-1">
            {row.original.models.slice(0, MODELS_SHOWN).map((model) => (
              <Badge key={model} variant="secondary">
                {model}
              </Badge>
            ))}
            {row.original.models.length > MODELS_SHOWN && (
              <Badge variant="outline">
                +{row.original.models.length - MODELS_SHOWN}
              </Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'generations',
        header: 'Steps',
        size: 90,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {row.original.generations}
            <span className="text-muted-foreground">
              {' '}
              / {row.original.events}
            </span>
          </span>
        ),
      },
      {
        accessorKey: 'inputTokens',
        header: 'Tokens',
        size: 120,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {formatTokens(row.original.inputTokens)}
            <span className="text-muted-foreground">
              {' '}
              → {formatTokens(row.original.outputTokens)}
            </span>
          </span>
        ),
      },
      {
        accessorKey: 'cost',
        header: 'Cost',
        size: 100,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {formatCost(row.original.cost)}
          </span>
        ),
      },
      {
        accessorKey: 'durationMs',
        header: 'Duration',
        size: 100,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {formatLatency(row.original.durationMs)}
          </span>
        ),
      },
      {
        accessorKey: 'isError',
        header: 'Status',
        size: 90,
        cell: ({ row }) =>
          row.original.isError ? (
            <Badge variant="destructive">
              <AlertTriangleIcon /> Error
            </Badge>
          ) : (
            <Badge variant="outline">
              <CheckIcon /> OK
            </Badge>
          ),
      },
    ],
    []
  );
}

export function AiTracesTable({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { organizationId } = useAppParams();
  const { range, startDate, endDate } = useOverviewOptions();
  const { filters } = useAiFilters();
  const query = useInfiniteQuery(
    trpc.ai.traces.infiniteQueryOptions(
      { projectId, range, startDate, endDate, filters, take: PAGE_SIZE },
      { getNextPageParam: (lastPage) => lastPage.meta.next }
    )
  );
  const data = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );
  const columns = useColumns();
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    // Pages come from the cursor query; one page keeps the floating pager away.
    pageCount: 1,
    filterFns: { isWithinRange: () => true },
    getRowId: (row) => row.id,
  });

  return (
    <div className="col gap-3">
      <DataTable
        empty={{
          title: 'No traces',
          description:
            'Traces appear once your app sends AI events. Wrap a model with @openpanel/ai or call op.ai().',
        }}
        error={query.isError}
        loading={query.isLoading}
        onRowClick={(row) =>
          navigate({
            to: '/$organizationId/$projectId/ai/traces/$traceId',
            params: { organizationId, projectId, traceId: row.original.id },
            search: { at: row.original.startedAt.toISOString() },
          })
        }
        table={table}
      />
      {query.hasNextPage && (
        <Button
          className="self-center"
          icon={BotIcon}
          loading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
          variant="outline"
        >
          Load more
        </Button>
      )}
    </div>
  );
}
