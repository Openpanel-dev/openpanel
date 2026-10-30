import type { IServiceAiEvent } from '@openpanel/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { AlertTriangleIcon, BotIcon, CheckIcon } from 'lucide-react';
import { useMemo } from 'react';
import {
  AI_TYPE_LABELS,
  formatCost,
  formatLatency,
  formatTokens,
} from './ai-format';
import { ProfileCell } from './ai-traces-table';
import { ColumnCreatedAt } from '@/components/column-created-at';
import { useEventDrawer } from '@/components/events/use-event-drawer';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table/data-table';
import { useAiFilters } from '@/hooks/use-ai-filters';
import { useTRPC } from '@/integrations/trpc/react';

const PAGE_SIZE = 50;

function previewText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const last = value.at(-1) as { content?: unknown } | undefined;
    return previewText(last?.content);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') {
      return record.text;
    }
    if (typeof record.content === 'string') {
      return record.content;
    }
    return JSON.stringify(value);
  }
  return '';
}

function useColumns(): ColumnDef<IServiceAiEvent>[] {
  return useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'Time',
        size: ColumnCreatedAt.size,
        cell: ({ row }) => (
          <ColumnCreatedAt>{row.original.createdAt}</ColumnCreatedAt>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Step',
        size: 200,
        cell: ({ row }) => (
          <div className="col min-w-0">
            <span className="truncate font-medium">
              {row.original.name || AI_TYPE_LABELS[row.original.type]}
            </span>
            <span className="truncate text-2xs text-muted-foreground">
              {previewText(row.original.input) ||
                AI_TYPE_LABELS[row.original.type]}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'model',
        header: 'Model',
        size: 180,
        cell: ({ row }) =>
          row.original.model ? (
            <Badge variant="secondary">{row.original.model}</Badge>
          ) : (
            <Badge variant="outline">{AI_TYPE_LABELS[row.original.type]}</Badge>
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
        accessorKey: 'totalCost',
        header: 'Cost',
        size: 100,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {formatCost(row.original.totalCost)}
          </span>
        ),
      },
      {
        accessorKey: 'latencyMs',
        header: 'Latency',
        size: 100,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {formatLatency(row.original.latencyMs)}
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
              <AlertTriangleIcon /> {row.original.httpStatus || 'Error'}
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

export function AiGenerationsTable({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const { openEvent } = useEventDrawer();
  const { range, startDate, endDate } = useOverviewOptions();
  const { filters } = useAiFilters();
  const query = useInfiniteQuery(
    trpc.ai.events.infiniteQueryOptions(
      {
        projectId,
        range,
        startDate,
        endDate,
        filters: { ...filters, types: ['generation', 'embedding'] },
        take: PAGE_SIZE,
      },
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
          title: 'No generations',
          description: 'Model calls appear here once your app sends AI events.',
        }}
        error={query.isError}
        loading={query.isLoading}
        onRowClick={(row) =>
          openEvent({ id: row.original.id, createdAt: row.original.createdAt })
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
