import { cn } from '@/utils/cn';

export interface Props<T> {
  columns: {
    name: React.ReactNode;
    render: (item: T, index: number) => React.ReactNode;
    className?: string;
    width: string;
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

  return (
    <div className="w-full overflow-x-auto">
      <div className={cn('w-full', className)}>
        {/* Header */}
        <div
          className={cn('grid border-b border-border head', columnClassName)}
          style={{ gridTemplateColumns }}
        >
          {columns.map((column) => (
            <div
              key={column.name?.toString()}
              className={cn(
                'p-2 font-medium font-sans text-sm whitespace-nowrap cell',
                columns.length > 1 && column !== columns[0]
                  ? 'text-right'
                  : 'text-left',
                column.className,
              )}
              style={{ width: column.width }}
            >
              {column.name}
            </div>
          ))}
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
              <div className="grid" style={{ gridTemplateColumns }}>
                {columns.map((column) => (
                  <div
                    key={column.name?.toString()}
                    className={cn(
                      'p-2 relative cell',
                      columns.length > 1 && column !== columns[0]
                        ? 'text-right'
                        : 'text-left',
                      column.className,
                      column.width === 'w-full' && 'w-full min-w-0',
                    )}
                    style={
                      column.width !== 'w-full' ? { width: column.width } : {}
                    }
                  >
                    {column.render(item, index)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
