import { ProjectLink } from '@/components/links';
import { Widget } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { WidgetHead } from '../overview/overview-widget';
import { useQuery } from '@tanstack/react-query';
import { FullPageEmptyState } from '../full-page-empty-state';

type Props = {
  profileId: string;
  projectId: string;
  groups: string[];
};

export const ProfileGroups = ({ projectId, groups }: Props) => {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.group.listByIds.queryOptions({
      projectId,
      ids: groups,
    }),
  );

  if (!groups.length) return null;

  return (
    <Widget className="w-full">
      <WidgetHead>
        <div className="title">Groups</div>
      </WidgetHead>
      {query.data?.length ? (
        <div className="flex flex-wrap gap-2 p-4">
          {query.data.map((group) => (
            <ProjectLink
              key={group.id}
              href={`/groups/${encodeURIComponent(group.id)}`}
              className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 hover:bg-muted transition-colors"
            >
              <div>
                <div className="text-sm font-medium">{group.name}</div>
                <div className="text-xs text-muted-foreground">
                  {group.type} · {group.id}
                </div>
              </div>
            </ProjectLink>
          ))}
        </div>
      ) : query.isLoading ? null : (
        <FullPageEmptyState title="No groups found" className="p-4" />
      )}
    </Widget>
  );
};
