import type { IServiceProfile } from '@openpanel/db';
import type { ColumnDef, SortDirection } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2 } from 'lucide-react';
import { ProfileAvatar } from '../profile-avatar';
import { ColumnCreatedAt } from '@/components/column-created-at';
import { ProjectLink } from '@/components/links';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { getProfileName } from '@/utils/getters';
import { cn } from '@/utils/cn';

// Enriched profile shape returned by `profile.list` / `profile.powerUsers`.
// Keeping these optional on `IServiceProfile` here (rather than re-declaring
// the full shape) so existing callers that still receive the non-enriched
// type continue to compile.
type EnrichedProfile = IServiceProfile & {
  eventCount?: number;
  sessionCount?: number;
  totalDuration?: number;
  lastSeen?: Date | string | null;
  firstSeenActivity?: Date | string | null;
  plan?: string | null;
  isSubscriber?: boolean;
};

/** Format a duration in seconds into `1h 24m` / `3m 20s` / `45s`. */
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) {
    return '—';
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

/** Header cell with a clickable sort affordance. Works with TanStack Table's
 * manual sorting — the column is sortable if its `meta.sortable` is true. */
function SortableHeader({
  label,
  direction,
  onToggle,
  align = 'left',
}: {
  label: string;
  direction: false | SortDirection;
  onToggle: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-1 font-medium hover:text-foreground transition-colors',
        align === 'right' && 'justify-end',
      )}
    >
      <span>{label}</span>
      {direction === 'asc' ? (
        <ArrowUp className="size-3" />
      ) : direction === 'desc' ? (
        <ArrowDown className="size-3" />
      ) : (
        <ArrowUpDown className="size-3 opacity-40" />
      )}
    </button>
  );
}

export function useColumns(type: 'profiles' | 'power-users') {
  const columns: ColumnDef<EnrichedProfile>[] = [
    {
      accessorKey: 'name',
      meta: { sortable: true, sortKey: 'name' },
      header: ({ column }) => (
        <SortableHeader
          label="Name"
          direction={column.getIsSorted()}
          onToggle={column.getToggleSortingHandler() as () => void}
        />
      ),
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <ProjectLink
            className="flex items-center gap-2 font-medium"
            href={`/profiles/${encodeURIComponent(profile.id)}`}
            title={getProfileName(profile, false)}
          >
            <ProfileAvatar size="sm" {...profile} />
            {getProfileName(profile)}
          </ProjectLink>
        );
      },
    },
    {
      accessorKey: 'plan',
      meta: { sortable: true, sortKey: 'plan' },
      header: ({ column }) => (
        <SortableHeader
          label="Plan"
          direction={column.getIsSorted()}
          onToggle={column.getToggleSortingHandler() as () => void}
        />
      ),
      cell({ row }) {
        const { plan, isSubscriber } = row.original;
        if (!plan && !isSubscriber) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            {isSubscriber && (
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
            )}
            <span className="truncate capitalize">{plan || 'subscriber'}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'eventCount',
      meta: { sortable: true, sortKey: 'eventCount' },
      header: ({ column }) => (
        <SortableHeader
          label="Events"
          align="right"
          direction={column.getIsSorted()}
          onToggle={column.getToggleSortingHandler() as () => void}
        />
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">
          {row.original.eventCount?.toLocaleString() ?? 0}
        </div>
      ),
    },
    {
      accessorKey: 'totalDuration',
      meta: { sortable: true, sortKey: 'totalDuration' },
      header: ({ column }) => (
        <SortableHeader
          label="Session time"
          align="right"
          direction={column.getIsSorted()}
          onToggle={column.getToggleSortingHandler() as () => void}
        />
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">
          {formatDuration(row.original.totalDuration ?? 0)}
        </div>
      ),
    },
    {
      accessorKey: 'country',
      meta: { sortable: true, sortKey: 'country' },
      header: ({ column }) => (
        <SortableHeader
          label="Country"
          direction={column.getIsSorted()}
          onToggle={column.getToggleSortingHandler() as () => void}
        />
      ),
      cell({ row }) {
        const { country, city } = row.original.properties;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={country} />
            <span className="truncate">{city || country}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'os',
      meta: { sortable: true, sortKey: 'os' },
      header: ({ column }) => (
        <SortableHeader
          label="OS"
          direction={column.getIsSorted()}
          onToggle={column.getToggleSortingHandler() as () => void}
        />
      ),
      cell({ row }) {
        const { os } = row.original.properties;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={os} />
            <span className="truncate">{os}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'model',
      meta: { sortable: true, sortKey: 'model' },
      header: ({ column }) => (
        <SortableHeader
          label="Model"
          direction={column.getIsSorted()}
          onToggle={column.getToggleSortingHandler() as () => void}
        />
      ),
      cell({ row }) {
        const { model, brand } = row.original.properties;
        if (!model && !brand) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={brand} />
            <span className="truncate">
              {[brand, model].filter(Boolean).join(' / ')}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'firstSeenActivity',
      meta: { sortable: true, sortKey: 'firstSeenActivity' },
      size: ColumnCreatedAt.size,
      header: ({ column }) => (
        <SortableHeader
          label="First seen"
          direction={column.getIsSorted()}
          onToggle={column.getToggleSortingHandler() as () => void}
        />
      ),
      cell: ({ row }) => {
        // Prefer the earliest event for this profile (when they actually
        // did something) and fall back to the profile row's createdAt.
        const value =
          row.original.firstSeenActivity ?? row.original.createdAt ?? null;
        if (!value) {
          return <span className="text-muted-foreground">—</span>;
        }
        return <ColumnCreatedAt>{value}</ColumnCreatedAt>;
      },
    },
    {
      accessorKey: 'lastSeen',
      meta: { sortable: true, sortKey: 'lastSeen' },
      size: ColumnCreatedAt.size,
      header: ({ column }) => (
        <SortableHeader
          label="Last seen"
          direction={column.getIsSorted()}
          onToggle={column.getToggleSortingHandler() as () => void}
        />
      ),
      cell: ({ row }) => {
        const value = row.original.lastSeen ?? null;
        if (!value) {
          return <span className="text-muted-foreground">—</span>;
        }
        return <ColumnCreatedAt>{value}</ColumnCreatedAt>;
      },
    },
    {
      accessorKey: 'groups',
      header: 'Groups',
      size: 200,
      meta: {
        hidden: true,
      },
      cell({ row }) {
        const { groups } = row.original;
        if (!groups?.length) {
          return null;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <ProjectLink
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:underline"
                href={`/groups/${encodeURIComponent(g)}`}
                key={g}
              >
                {g}
              </ProjectLink>
            ))}
          </div>
        );
      },
    },
  ];

  // All three tabs (Identified / Anonymous / Power Users) now share the
  // same column set; `type` is currently only used to drive different
  // default sorts on the route side.
  void type;
  return columns;
}
