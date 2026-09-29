import React from 'react';
import { cn } from '@/utils/cn';

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
    /**
     * Function to extract sortable value. If provided, header becomes clickable.
     */
    getSortValue?: (item: T) => number | string | null;
    /**
     * Optional key for React keys. If not provided, will try to extract from name or use index.
     */
    key?: string;
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
        'sticky top-0 z-10 border-border border-b bg-def-100 text-def-1000 [&_th:first-child]:text-left [&_th:last-child]:text-right [&_th]:whitespace-nowrap [&_th]:p-4 [&_th]:py-2 [&_th]:text-right [&_th]:font-medium',
        className
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
  if (priority === 1) {
    return '';
  }

  // Columns will be hidden via CSS container queries
  // Return empty string - hiding is handled by CSS
  return '';
}

/**
 * No class of its own: a `data-min-width` column is hidden and revealed by the
 * `@container` rules generated above, keyed on that attribute. Returning
 * `hidden` here would pin the column shut and defeat them.
 */
function getMinWidthClass(_minWidth: number): string {
  return '';
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

  // `useId` is stable across SSR and hydration where `Math.random()` was not:
  // the id lands in a className AND inside injected <style> text, so both the
  // attribute and the stylesheet differed and React regenerated the subtree
  // (ISSUES.md H10). React's ids contain colons, which are not valid in a CSS
  // selector, so they are stripped.
  const reactId = React.useId();
  const containerId = `widget-table-${reactId.replace(/:/g, '')}`;

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
          `@container (min-width: ${minWidth}px) { .${containerId} .cell[data-priority="${column.responsive.priority}"] { min-width: revert; max-width: revert; padding-left: revert; padding-right: 0.5rem; overflow: revert; visibility: visible !important; } }`
        );
      } else if (column.responsive?.minWidth !== undefined) {
        styles.push(
          `.${containerId} .cell[data-min-width="${column.responsive.minWidth}"] { min-width: 0; max-width: 0; padding-left: 0; padding-right: 0; overflow: hidden; visibility: hidden; }`,
          `@container (min-width: ${column.responsive.minWidth}px) { .${containerId} .cell[data-min-width="${column.responsive.minWidth}"] { min-width: revert; max-width: revert; padding-left: revert; padding-right: 0.5rem; overflow: revert; visibility: visible !important; } }`
        );
      }
    });

    // Ensure last visible cell always has padding-right
    styles.push(
      `.${containerId} .cell:last-child { padding-right: 1rem !important; }`
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
          className={cn('head grid border-border border-b', columnClassName)}
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

            const columnKey =
              column.key ??
              (typeof column.name === 'string'
                ? column.name
                : `col-${colIndex}`);

            return (
              <div
                className={cn(
                  'cell whitespace-nowrap p-2 font-medium font-sans text-sm',
                  columns.length > 1 && column !== columns[0]
                    ? 'text-right'
                    : 'text-left',
                  responsiveClass
                )}
                key={columnKey}
                style={{ width: column.width }}
                {...dataAttrs}
              >
                {column.name}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="body flex flex-col">
          {data.map((item, index) => (
            <div
              className={cn(
                'group/row relative h-8 overflow-hidden border-border border-b last:border-0',
                columnClassName
              )}
              key={keyExtractor(item)}
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
                      column.responsive.priority
                    );
                  }
                  if (column.responsive?.minWidth !== undefined) {
                    dataAttrs['data-min-width'] = String(
                      column.responsive.minWidth
                    );
                  }

                  const columnKey =
                    column.key ??
                    (typeof column.name === 'string'
                      ? column.name
                      : `col-${colIndex}`);

                  return (
                    <div
                      className={cn(
                        'cell relative px-2',
                        columns.length > 1 && column !== columns[0]
                          ? 'text-right'
                          : 'text-left',
                        column.className,
                        column.width === 'w-full' && 'w-full min-w-0',
                        responsiveClass
                      )}
                      key={columnKey}
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
