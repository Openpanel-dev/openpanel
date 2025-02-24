import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import { WidgetTable, type Props as WidgetTableProps } from '../widget-table';

type Props<T> = WidgetTableProps<T> & {
  getColumnPercentage: (item: T) => number;
};

export const OverviewWidgetTable = <T,>({
  data,
  keyExtractor,
  columns,
  getColumnPercentage,
}: Props<T>) => {
  const number = useNumber();

  return (
    <>
      <div className="-m-4">
        <WidgetTable
          data={data ?? []}
          keyExtractor={keyExtractor}
          className="text-sm"
          columnClassName="px-2 group/row items-center"
          eachColumn={(item) => {
            return (
              <div className="absolute inset-1 inset-x-3 !p-0">
                <div
                  className="h-full bg-def-200 rounded-sm group-hover/row:bg-blue-200 transition-colors"
                  style={{
                    width: `${getColumnPercentage(item) * 100}%`,
                  }}
                />
              </div>
            );
          }}
          columns={columns.map((column, index) => {
            return {
              ...column,
              className: cn(
                index === 0
                  ? 'w-full flex-1 font-medium min-w-0'
                  : 'text-right w-20 font-mono',
                column.className,
              ),
            };
          })}
        />
      </div>
    </>
  );
};
