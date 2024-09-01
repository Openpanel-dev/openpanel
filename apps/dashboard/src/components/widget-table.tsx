import { cn } from '@/utils/cn';

interface Props<T> {
  columns: {
    name: string;
    render: (item: T) => React.ReactNode;
  }[];
  keyExtractor: (item: T) => string;
  data: T[];
  className?: string;
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
        'text-def-1000 sticky top-0 z-10 border-b border-border bg-def-100  [&_th:last-child]:text-right [&_th]:whitespace-nowrap [&_th]:p-4 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium',
        className
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
}: Props<T>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full', className)}>
        <WidgetTableHead>
          <tr>
            {columns.map((column) => (
              <th key={column.name}>{column.name}</th>
            ))}
          </tr>
        </WidgetTableHead>
        <tbody>
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              className="border-b border-border text-right  last:border-0 [&_td:first-child]:text-left [&_td]:p-4"
            >
              {columns.map((column) => (
                <td key={column.name}>{column.render(item)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
