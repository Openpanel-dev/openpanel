import { cn } from '@/utils/cn';

export interface Props<T> {
  columns: {
    name: string;
    render: (item: T) => React.ReactNode;
    className?: string;
  }[];
  keyExtractor: (item: T) => string;
  data: T[];
  className?: string;
  eachColumn?: (item: T) => React.ReactNode;
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
  eachColumn,
  columnClassName,
}: Props<T>) {
  return (
    <div className="w-full overflow-x-auto">
      <div className={cn('w-full', className)}>
        <div
          className={cn(
            'border-b border-border text-right last:border-0 [&_div:first-child]:text-left grid',
            '[&>div]:p-2',
            columnClassName,
          )}
          style={{
            gridTemplateColumns:
              columns.length > 1
                ? `1fr ${columns
                    .slice(1)
                    .map((col) => 'auto')
                    .join(' ')}`
                : '1fr',
          }}
        >
          {columns.map((column) => (
            <div
              key={column.name}
              className={cn(column.className, 'font-medium font-sans text-sm')}
            >
              {column.name}
            </div>
          ))}
        </div>
        <div className="col">
          {data.map((item) => (
            <div
              key={keyExtractor(item)}
              className={cn(
                'border-b border-border text-right last:border-0 [&_div:first-child]:text-left grid relative',
                '[&>div]:p-2',
                columnClassName,
              )}
              style={{
                gridTemplateColumns:
                  columns.length > 1
                    ? `1fr ${columns
                        .slice(1)
                        .map((col) => 'auto')
                        .join(' ')}`
                    : '1fr',
              }}
            >
              {eachColumn?.(item)}
              {columns.map((column) => (
                <div
                  key={column.name}
                  className={cn(column.className, 'relative')}
                >
                  {column.render(item)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
