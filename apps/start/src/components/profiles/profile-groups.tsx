import { ProjectLink } from '@/components/links';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { UsersIcon } from 'lucide-react';

interface Props {
  profileId: string;
  projectId: string;
  groups: string[];
}

export const ProfileGroups = ({ projectId, groups }: Props) => {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.group.listByIds.queryOptions({
      projectId,
      ids: groups,
    }),
  );

  if (groups.length === 0 || !query.data?.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
        <UsersIcon className="size-3.5" />
        Groups
      </span>
      {query.data.map((group) => (
        <ProjectLink
          key={group.id}
          href={`/groups/${encodeURIComponent(group.id)}`}
          className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs transition-colors hover:bg-muted"
        >
          <span className="font-medium">{group.name}</span>
          <span className="text-muted-foreground">{group.type}</span>
        </ProjectLink>
      ))}
    </div>
  );
};
