import { DialogTitle } from '@radix-ui/react-dialog';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SearchIcon } from 'lucide-react';
import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import { Input } from '../ui/input';
import { useNumber } from '@/hooks/use-numer-formatter';
import { ModalContent } from '@/modals/Modal/Container';

const ROW_HEIGHT = 36;

function RevenuePieChart({ percentage }: { percentage: number }) {
  const size = 16;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - percentage * circumference;

  return (
    <svg className="flex-shrink-0" height={size} width={size}>
      <circle
        className="text-def-200"
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <circle
        className="transition-all"
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke="#3ba974"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export interface OverviewListItem {
  sessions: number;
  pageviews: number;
  revenue?: number;
}

interface OverviewListModalProps<T extends OverviewListItem> {
  title: string;
  searchPlaceholder?: string;
  data: T[];
  keyExtractor: (item: T) => string;
  /** Receives the item and the already-lowercased search query. */
  searchFilter: (item: T, query: string) => boolean;
  /** Renders the first column's content. */
  renderItem: (item: T) => React.ReactNode;
  footer?: React.ReactNode;
  /** Appears below the title/search area. */
  headerContent?: React.ReactNode;
  columnName?: string;
  showPageviews?: boolean;
  showSessions?: boolean;
}

export function OverviewListModal<T extends OverviewListItem>({
  title,
  searchPlaceholder = 'Search...',
  data,
  keyExtractor,
  searchFilter,
  renderItem,
  footer,
  headerContent,
  columnName = 'Name',
  showPageviews = true,
  showSessions = true,
}: OverviewListModalProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const number = useNumber();

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return data;
    }
    const queryLower = searchQuery.toLowerCase();
    return data.filter((item) => searchFilter(item, queryLower));
  }, [data, searchQuery, searchFilter]);

  const { maxSessions, totalRevenue, hasRevenue, hasPageviews } =
    useMemo(() => {
      const maxSessions = Math.max(
        ...filteredData.map((item) => item.sessions)
      );
      const totalRevenue = filteredData.reduce(
        (sum, item) => sum + (item.revenue ?? 0),
        0
      );
      const hasRevenue = filteredData.some((item) => (item.revenue ?? 0) > 0);
      const hasPageviews =
        showPageviews && filteredData.some((item) => item.pageviews > 0);
      return { maxSessions, totalRevenue, hasRevenue, hasPageviews };
    }, [filteredData, showPageviews]);

  const virtualizer = useVirtualizer({
    count: filteredData.length,
    getScrollElement: () => scrollAreaRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <ModalContent className="!max-h-[90vh] flex flex-col gap-0 p-0 sm:max-w-2xl">
      <div className="flex-shrink-0 border-border border-b">
        <div className="p-6 pb-4">
          <DialogTitle className="mb-4 font-semibold text-lg">
            {title}
          </DialogTitle>
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={searchQuery}
            />
          </div>
          {headerContent}
        </div>

        <div
          className="grid bg-def-100 px-4 py-2 font-medium text-muted-foreground text-sm"
          style={{
            gridTemplateColumns:
              `1fr ${hasRevenue ? '100px' : ''} ${hasPageviews ? '80px' : ''} ${showSessions ? '80px' : ''}`.trim(),
          }}
        >
          <div className="truncate text-left">{columnName}</div>
          {hasRevenue && <div className="text-right">Revenue</div>}
          {hasPageviews && <div className="text-right">Views</div>}
          {showSessions && <div className="text-right">Sessions</div>}
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        ref={scrollAreaRef}
        style={{ maxHeight: '60vh' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const item = filteredData[virtualRow.index];
            if (!item) {
              return null;
            }

            const percentage = item.sessions / maxSessions;
            const revenuePercentage =
              totalRevenue > 0 ? (item.revenue ?? 0) / totalRevenue : 0;

            return (
              <div
                className="group/row absolute top-0 left-0 w-full"
                key={keyExtractor(item)}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="absolute inset-0 overflow-hidden">
                  <div
                    className="h-full bg-def-200 transition-colors group-hover/row:bg-blue-200 dark:group-hover/row:bg-blue-900"
                    style={{ width: `${percentage * 100}%` }}
                  />
                </div>

                <div
                  className="relative grid h-full items-center border-border border-b px-4"
                  style={{
                    gridTemplateColumns:
                      `1fr ${hasRevenue ? '100px' : ''} ${hasPageviews ? '80px' : ''} ${showSessions ? '80px' : ''}`.trim(),
                  }}
                >
                  <div className="min-w-0 truncate pr-2">
                    {renderItem(item)}
                  </div>

                  {hasRevenue && (
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className="font-mono font-semibold text-sm"
                        style={{ color: '#3ba974' }}
                      >
                        {(item.revenue ?? 0) > 0
                          ? number.currency((item.revenue ?? 0) / 100, {
                              short: true,
                            })
                          : '-'}
                      </span>
                      <RevenuePieChart percentage={revenuePercentage} />
                    </div>
                  )}

                  {hasPageviews && (
                    <div className="text-right font-mono font-semibold text-sm">
                      {number.short(item.pageviews)}
                    </div>
                  )}

                  {showSessions && (
                    <div className="text-right font-mono font-semibold text-sm">
                      {number.short(item.sessions)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredData.length === 0 && (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            {searchQuery ? 'No results found' : 'No data available'}
          </div>
        )}
      </div>

      {footer && (
        <div className="flex-shrink-0 border-border border-t p-4">{footer}</div>
      )}
    </ModalContent>
  );
}
