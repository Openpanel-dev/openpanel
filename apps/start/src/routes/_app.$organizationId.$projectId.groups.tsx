import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Building2Icon } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { formatDateTime } from '@/utils/date';
import { createProjectTitle } from '@/utils/title';

export const Route = createFileRoute('/_app/$organizationId/$projectId/groups')(
  {
    component: Component,
    head: () => ({
      meta: [{ title: createProjectTitle('Groups') }],
    }),
  }
);

function Component() {
  const { projectId, organizationId } = Route.useParams();
  const trpc = useTRPC();
  const { search, setSearch, debouncedSearch } = useSearchQueryState();
  const [typeFilter, setTypeFilter] = useQueryState(
    'type',
    parseAsString.withDefault('')
  );

  const typesQuery = useQuery(trpc.group.types.queryOptions({ projectId }));

  const groupsQuery = useQuery(
    trpc.group.list.queryOptions(
      {
        projectId,
        search: debouncedSearch || undefined,
        type: typeFilter || undefined,
        take: 100,
      },
      { placeholderData: keepPreviousData }
    )
  );

  const groups = groupsQuery.data?.data ?? [];
  const types = typesQuery.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        description="Groups represent companies, teams, or other entities that events belong to."
        title="Groups"
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Input
          className="w-64"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search groups..."
          value={search}
        />
        {types.length > 0 && (
          <Select
            onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}
            value={typeFilter || 'all'}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <Building2Icon className="size-10 opacity-30" />
          <p className="text-sm">No groups found</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-def-100">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  ID
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Type
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr
                  className="border-b transition-colors last:border-0 hover:bg-def-100"
                  key={`${group.projectId}-${group.id}`}
                >
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium hover:underline"
                      params={{ organizationId, projectId, groupId: group.id }}
                      to="/$organizationId/$projectId/groups/$groupId"
                    >
                      {group.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                    {group.id}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{group.type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateTime(new Date(group.createdAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
