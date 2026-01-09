import { useNumber } from '@/hooks/use-numer-formatter';
import { ModalContent } from '@/modals/Modal/Container';
import { cn } from '@/utils/cn';
import { DialogTitle } from '@radix-ui/react-dialog';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SearchIcon } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import { Input } from '../ui/input';

const ROW_HEIGHT = 36;

// Revenue pie chart component
function RevenuePieChart({ percentage }: { percentage: number }) {
  const size = 16;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - percentage * circumference;

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-def-200"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#3ba974"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all"
      />
    </svg>
  );
}

// Base data type that all items must conform to
export interface OverviewListItem {
  sessions: number;
  pageviews: number;
  revenue?: number;
}

interface OverviewListModalProps<T extends OverviewListItem> {
  /** Modal title */
  title: string;
  /** Search placeholder text */
  searchPlaceholder?: string;
  /** The data to display */
  data: T[];
  /** Extract a unique key for each item */
  keyExtractor: (item: T) => string;
  /** Filter function for search - receives item and lowercase search query */
  searchFilter: (item: T, query: string) => boolean;
  /** Render the main content cell (first column) */
  renderItem: (item: T) => React.ReactNode;
  /** Optional footer content */
  footer?: React.ReactNode;
  /** Optional header content (appears below title/search) */
  headerContent?: React.ReactNode;
  /** Column name for the first column */
  columnName?: string;
  /** Whether to show pageviews column */
  showPageviews?: boolean;
  /** Whether to show sessions column */
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

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return data;
    }
    const queryLower = searchQuery.toLowerCase();
    return data.filter((item) => searchFilter(item, queryLower));
  }, [data, searchQuery, searchFilter]);

  // Calculate totals and check for revenue
  const { maxSessions, totalRevenue, hasRevenue, hasPageviews } =
    useMemo(() => {
      const maxSessions = Math.max(...filteredData.map((item) => item.sessions));
      const totalRevenue = filteredData.reduce(
        (sum, item) => sum + (item.revenue ?? 0),
        0,
      );
      const hasRevenue = filteredData.some((item) => (item.revenue ?? 0) > 0);
      const hasPageviews =
        showPageviews && filteredData.some((item) => item.pageviews > 0);
      return { maxSessions, totalRevenue, hasRevenue, hasPageviews };
    }, [filteredData, showPageviews]);

  // Virtual list setup
  const virtualizer = useVirtualizer({
    count: filteredData.length,
    getScrollElement: () => scrollAreaRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <ModalContent className="flex !max-h-[90vh] flex-col p-0 gap-0 sm:max-w-2xl">
      {/* Sticky Header */}
      <div className="flex-shrink-0 border-b border-border">
        <div className="p-6 pb-4">
          <DialogTitle className="text-lg font-semibold mb-4">
            {title}
          </DialogTitle>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {headerContent}
        </div>

        {/* Column Headers */}
        <div
          className="grid px-4 py-2 text-sm font-medium text-muted-foreground bg-def-100"
          style={{
            gridTemplateColumns: `1fr ${hasRevenue ? '100px' : ''} ${hasPageviews ? '80px' : ''} ${showSessions ? '80px' : ''}`.trim(),
          }}
        >
          <div className="text-left truncate">{columnName}</div>
          {hasRevenue && <div className="text-right">Revenue</div>}
          {hasPageviews && <div className="text-right">Views</div>}
          {showSessions && <div className="text-right">Sessions</div>}
        </div>
      </div>

      {/* Virtualized Scrollable Body */}
      <div
        ref={scrollAreaRef}
        className="flex-1 min-h-0 overflow-y-auto"
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
            if (!item) return null;

            const percentage = item.sessions / maxSessions;
            const revenuePercentage =
              totalRevenue > 0 ? (item.revenue ?? 0) / totalRevenue : 0;

            return (
              <div
                key={keyExtractor(item)}
                className="absolute top-0 left-0 w-full group/row"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {/* Background bar */}
                <div className="absolute inset-0 overflow-hidden">
                  <div
                    className="h-full bg-def-200 group-hover/row:bg-blue-200 dark:group-hover/row:bg-blue-900 transition-colors"
                    style={{ width: `${percentage * 100}%` }}
                  />
                </div>

                {/* Row content */}
                <div
                  className="relative grid h-full items-center px-4 border-b border-border"
                  style={{
                    gridTemplateColumns: `1fr ${hasRevenue ? '100px' : ''} ${hasPageviews ? '80px' : ''} ${showSessions ? '80px' : ''}`.trim(),
                  }}
                >
                  {/* Main content cell */}
                  <div className="min-w-0 truncate pr-2">{renderItem(item)}</div>

                  {/* Revenue cell */}
                  {hasRevenue && (
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className="font-semibold font-mono text-sm"
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

                  {/* Pageviews cell */}
                  {hasPageviews && (
                    <div className="text-right font-semibold font-mono text-sm">
                      {number.short(item.pageviews)}
                    </div>
                  )}

                  {/* Sessions cell */}
                  {showSessions && (
                    <div className="text-right font-semibold font-mono text-sm">
                      {number.short(item.sessions)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {filteredData.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            {searchQuery ? 'No results found' : 'No data available'}
          </div>
        )}
      </div>

      {/* Fixed Footer */}
      {footer && (
        <div className="flex-shrink-0 border-t border-border p-4">{footer}</div>
      )}
    </ModalContent>
  );
}

