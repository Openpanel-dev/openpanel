import { useAppParams } from '@/hooks/use-app-params';
import { ColumnCreatedAt } from '@/components/column-created-at';
import { Badge } from '@/components/ui/badge';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import type { IServiceGroup } from '@openpanel/db';

/** Friendly plan labels for the Groups table. Matches the names Pin
 *  Drop uses in Stripe/RevenueCat so the column reads the way support
 *  expects. Keys are lowercased so the lookup is case-insensitive. */
/** Pin Drop's four SKUs. Team Pro is the enterprise tier — they're the
 *  same product, just two names depending on where you land. */
const PLAN_LABELS: Record<string, string> = {
  solo: 'Solo',
  free: 'Solo',
  team: 'Team',
  'team-plus': 'Team+',
  team_plus: 'Team+',
  teamplus: 'Team+',
  'team+': 'Team+',
  pro: 'Team Pro',
  'team-pro': 'Team Pro',
  team_pro: 'Team Pro',
  teampro: 'Team Pro',
  enterprise: 'Team Pro',
};

const PLAN_BADGE_STYLE: Record<string, string> = {
  Solo: 'bg-slate-100 text-slate-700 border-slate-200',
  Team: 'bg-blue-50 text-blue-700 border-blue-200',
  'Team+': 'bg-purple-50 text-purple-700 border-purple-200',
  'Team Pro': 'bg-amber-50 text-amber-700 border-amber-200',
};

export type IServiceGroupWithStats = IServiceGroup & {
  memberCount: number;
  lastActiveAt: Date | null;
};

export function useGroupColumns(): ColumnDef<IServiceGroupWithStats>[] {
  const { organizationId, projectId } = useAppParams();

  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const group = row.original;
        return (
          <Link
            className="font-medium hover:underline"
            params={{ organizationId, projectId, groupId: group.id }}
            to="/$organizationId/$projectId/groups/$groupId"
          >
            {group.name}
          </Link>
        );
      },
    },
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => (
        <span className="font-mono text-muted-foreground text-xs">
          {row.original.id}
        </span>
      ),
    },
    {
      // Surface the subscription plan from the group's `properties.plan`
      // (which your Stripe/RevenueCat webhook handler is expected to
      // set on every `group` event). Falls back to the raw value —
      // e.g. "Starter" — when we don't have a friendly mapping for it.
      accessorKey: 'plan',
      header: 'Plan',
      cell: ({ row }) => {
        const raw = (row.original.properties as any)?.plan as
          | string
          | undefined;
        if (!raw) {
          return <span className="text-muted-foreground">—</span>;
        }
        const label = PLAN_LABELS[raw.toLowerCase()] ?? raw;
        const badgeClass =
          PLAN_BADGE_STYLE[label] ?? 'bg-muted text-foreground border-border';
        return (
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
          >
            {label}
          </span>
        );
      },
    },
    {
      accessorKey: 'memberCount',
      header: 'Members',
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.memberCount}</span>
      ),
    },
    {
      accessorKey: 'lastActiveAt',
      header: 'Last active',
      size: ColumnCreatedAt.size,
      cell: ({ row }) =>
        row.original.lastActiveAt ? (
          <ColumnCreatedAt>{row.original.lastActiveAt}</ColumnCreatedAt>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      size: ColumnCreatedAt.size,
      cell: ({ row }) => (
        <ColumnCreatedAt>{row.original.createdAt}</ColumnCreatedAt>
      ),
    },
  ];
}
