import { cn } from '@/utils/cn';
import React from 'react';

export type ColumnPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface ColumnResponsive {
  /**
   * Priority determines the order columns are hidden.
   * Lower numbers = higher priority (hidden last).
   * Higher numbers = lower priority (hidden first).
   * Default: 5 (medium priority)
   */
  priority?: ColumnPriority;
  /**
   * Minimum container width (in pixels) at which this column should be visible.
   * If not specified, uses priority-based breakpoints.
   */
  minWidth?: number;
}

export interface Props<T> {
  columns: {
    name: React.ReactNode;
    render: (item: T, index: number) => React.ReactNode;
    className?: string;
    width: string;
    /**
     * Responsive settings for this column.
     * If not provided, column is always visible.
     */
    responsive?: ColumnResponsive;
  }[];
  keyExtractor: (item: T) => string;
  data: T[];
  className?: string;
  eachRow?: (item: T, index: number) => React.ReactNode;
  columnClassName?: string;
}

export const WidgetTableHead = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <thead
      className={cn(
        'text-def-1000 sticky top-0 z-10 border-b border-border bg-def-100  [&_th:last-child]:text-right [&_th]:whitespace-nowrap [&_th]:p-4 [&_th]:py-2 [&_th]:text-right [&_th:first-child]:text-left [&_th]:font-medium',
        className,
      )}
    >
      {children}
    </thead>
  );
};

/**
 * Generates container query class based on priority.
 * Lower priority numbers = hidden at smaller widths.
 * Priority 1 = always visible (highest priority)
 * Priority 10 = hidden first (lowest priority)
 */
function getResponsiveClass(priority: ColumnPriority): string {
  // Priority 1 = always visible (no hiding)
  if (priority === 1) {
    return '';
  }

  // Columns will be hidden via CSS container queries
  // Return empty string - hiding is handled by CSS
  return '';
}

function getResponsiveStyle(
  priority: ColumnPriority,
): React.CSSProperties | undefined {
  if (priority === 1) {
    return undefined;
  }

  const minWidth = (priority - 1) * 100 + 100;
  return {
    // Use CSS custom property for container query
    // Will be handled by inline style with container query
  } as React.CSSProperties;
}

/**
 * Generates container query class based on custom min-width.
 */
function getMinWidthClass(minWidth: number): string {
  return 'hidden';
}

export function WidgetTable<T>({
  className,
  columns,
  data,
  keyExtractor,
  eachRow,
  columnClassName,
}: Props<T>) {
  const gridTemplateColumns =
    columns.length > 1
      ? `1fr ${columns
          .slice(1)
          .map(() => 'auto')
          .join(' ')}`
      : '1fr';

  const containerId = React.useMemo(
    () => `widget-table-${Math.random().toString(36).substring(7)}`,
    [],
  );

  // Generate CSS for container queries
  const containerQueryStyles = React.useMemo(() => {
    const styles: string[] = [];

    columns.forEach((column) => {
      if (
        column.responsive?.priority !== undefined &&
        column.responsive.priority > 1
      ) {
        // Breakpoints - Priority 2 = 150px, Priority 3 = 250px, etc.
        // Less aggressive: columns show at smaller container widths
        const minWidth = (column.responsive.priority - 1) * 100 + 50;
        // Hide by default by collapsing width and hiding content
        // Keep in grid flow but take up minimal space
        styles.push(
          `.${containerId} .cell[data-priority="${column.responsive.priority}"] { min-width: 0; max-width: 0; padding-left: 0; padding-right: 0; overflow: hidden; visibility: hidden; }`,
          `@container (min-width: ${minWidth}px) { .${containerId} .cell[data-priority="${column.responsive.priority}"] { min-width: revert; max-width: revert; padding-left: revert; padding-right: 0.5rem; overflow: revert; visibility: visible !important; } }`,
        );
      } else if (column.responsive?.minWidth !== undefined) {
        styles.push(
          `.${containerId} .cell[data-min-width="${column.responsive.minWidth}"] { min-width: 0; max-width: 0; padding-left: 0; padding-right: 0; overflow: hidden; visibility: hidden; }`,
          `@container (min-width: ${column.responsive.minWidth}px) { .${containerId} .cell[data-min-width="${column.responsive.minWidth}"] { min-width: revert; max-width: revert; padding-left: revert; padding-right: 0.5rem; overflow: revert; visibility: visible !important; } }`,
        );
      }
    });

    // Ensure last visible cell always has padding-right
    styles.push(
      `.${containerId} .cell:last-child { padding-right: 1rem !important; }`,
    );

    return styles.length > 0 ? <style>{styles.join('\n')}</style> : null;
  }, [columns, containerId]);

  return (
    <div className="w-full overflow-x-auto">
      <div
        className={cn('w-full', className, containerId)}
        style={{ containerType: 'inline-size' }}
      >
        {containerQueryStyles}
        {/* Header */}
        <div
          className={cn('grid border-b border-border head', columnClassName)}
          style={{ gridTemplateColumns }}
        >
          {columns.map((column, colIndex) => {
            const responsiveClass =
              column.responsive?.priority !== undefined
                ? getResponsiveClass(column.responsive.priority)
                : column.responsive?.minWidth !== undefined
                  ? getMinWidthClass(column.responsive.minWidth)
                  : '';

            const dataAttrs: Record<string, string> = {};
            if (column.responsive?.priority !== undefined) {
              dataAttrs['data-priority'] = String(column.responsive.priority);
            }
            if (column.responsive?.minWidth !== undefined) {
              dataAttrs['data-min-width'] = String(column.responsive.minWidth);
            }

            return (
              <div
                key={column.name?.toString()}
                className={cn(
                  'p-2 font-medium font-sans text-sm whitespace-nowrap cell',
                  columns.length > 1 && column !== columns[0]
                    ? 'text-right'
                    : 'text-left',
                  responsiveClass,
                )}
                style={{ width: column.width }}
                {...dataAttrs}
              >
                {column.name}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex flex-col body">
          {data.map((item, index) => (
            <div
              key={keyExtractor(item)}
              className={cn(
                'group/row relative border-b border-border last:border-0 h-8 overflow-hidden',
                columnClassName,
              )}
            >
              {eachRow?.(item, index)}
              <div
                className="grid h-8 items-center"
                style={{ gridTemplateColumns }}
              >
                {columns.map((column, colIndex) => {
                  const responsiveClass =
                    column.responsive?.priority !== undefined
                      ? getResponsiveClass(column.responsive.priority)
                      : column.responsive?.minWidth !== undefined
                        ? getMinWidthClass(column.responsive.minWidth)
                        : '';

                  const dataAttrs: Record<string, string> = {};
                  if (column.responsive?.priority !== undefined) {
                    dataAttrs['data-priority'] = String(
                      column.responsive.priority,
                    );
                  }
                  if (column.responsive?.minWidth !== undefined) {
                    dataAttrs['data-min-width'] = String(
                      column.responsive.minWidth,
                    );
                  }

                  return (
                    <div
                      key={column.name?.toString()}
                      className={cn(
                        'px-2 relative cell',
                        columns.length > 1 && column !== columns[0]
                          ? 'text-right'
                          : 'text-left',
                        column.className,
                        column.width === 'w-full' && 'w-full min-w-0',
                        responsiveClass,
                      )}
                      style={
                        column.width !== 'w-full' ? { width: column.width } : {}
                      }
                      {...dataAttrs}
                    >
                      {column.render(item, index)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
