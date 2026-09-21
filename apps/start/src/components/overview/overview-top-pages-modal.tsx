import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Tooltiper } from '../ui/tooltip';
import { OverviewListModal } from './overview-list-modal';
import { useOverviewOptions } from './useOverviewOptions';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';

interface OverviewTopPagesProps {
  projectId: string;
}

export default function OverviewTopPagesModal({
  projectId,
}: OverviewTopPagesProps) {
  const [filters, setFilter] = useEventQueryFilters();
  const { startDate, endDate, range } = useOverviewOptions();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.overview.topPages.queryOptions({
      projectId,
      filters,
      startDate,
      endDate,
      mode: 'page',
      range,
    })
  );

  return (
    <OverviewListModal
      columnName="Path"
      data={query.data ?? []}
      keyExtractor={(item) => item.path + item.origin}
      renderItem={(item) => (
        <Tooltiper asChild content={item.origin + item.path} side="left">
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={item.origin} />
            <button
              className="truncate hover:underline"
              onClick={() => {
                setFilter('path', item.path);
                setFilter('origin', item.origin);
              }}
              type="button"
            >
              {item.path || <span className="opacity-40">Not set</span>}
            </button>
            <a
              className="flex-shrink-0"
              href={item.origin + item.path}
              onClick={(e) => e.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLinkIcon className="size-3 opacity-0 transition-opacity group-hover/row:opacity-100" />
            </a>
          </div>
        </Tooltiper>
      )}
      searchFilter={(item, query) =>
        item.path.toLowerCase().includes(query) ||
        item.origin.toLowerCase().includes(query)
      }
      searchPlaceholder="Search pages..."
      title="Top Pages"
    />
  );
}
