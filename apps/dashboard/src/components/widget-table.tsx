import { cn } from '@/utils/cn';

export interface Props<T> {
  columns: {
    name: React.ReactNode;
    render: (item: T, index: number) => React.ReactNode;
    className?: string;
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
  return (
    <div className="w-full overflow-x-auto">
      <div className={cn('w-full', className)}>
        <table className="w-full table-fixed">
          <thead>
            <tr
              className={cn(
                'border-b border-border text-right last:border-0 [&_td:first-child]:text-left',
                '[&>td]:p-2',
                columnClassName,
              )}
            >
              {columns.map((column) => (
                <th
                  key={column.name?.toString()}
                  className={cn(
                    column.className,
                    'font-medium font-sans text-sm p-2 whitespace-nowrap',
                  )}
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr
                key={keyExtractor(item)}
                className={cn(
                  'h-8 border-b border-border text-right last:border-0 [&_td:first-child]:text-left relative',
                  '[&>td]:p-2',
                  columnClassName,
                )}
              >
                {columns.map((column, columnIndex) => (
                  <td
                    key={column.name?.toString()}
                    className={cn(
                      'h-8',
                      columnIndex !== 0 && 'relative z-5',
                      column.className,
                    )}
                  >
                    {columnIndex === 0 && eachRow?.(item, index)}
                    {column.render(item, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
