import { max, min } from '@openpanel/shared';
import { useReportChartContext } from '../context';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';

type CohortData = RouterOutputs['chart']['cohort'];

type CohortTableProps = {
  data: CohortData;
};

const CohortTable: React.FC<CohortTableProps> = ({ data }) => {
  const {
    report: { unit, interval },
  } = useReportChartContext();
  const isPercentage = unit === '%';
  const number = useNumber();
  const highestValue = max(data.map((row) => max(row.values)));
  const lowestValue = min(data.map((row) => min(row.values)));
  const rowWithHigestSum = data.find(
    (row) => row.sum === max(data.map((row) => row.sum))
  );

  const getBackground = (value: number | undefined) => {
    if (!value) {
      return {
        backgroundClassName: '',
        opacity: 0,
      };
    }

    const percentage = isPercentage
      ? value / 100
      : (value - lowestValue) / (highestValue - lowestValue);
    const opacity = Math.max(0.05, percentage);

    return {
      backgroundClassName: 'bg-highlight dark:bg-emerald-700',
      opacity,
    };
  };

  const thClassName =
    'h-10 align-top pt-3 whitespace-nowrap font-semibold text-muted-foreground';

  return (
    <div className="card relative overflow-hidden">
      <div
        className={'absolute top-px right-0 left-0 h-10 border-b bg-def-100'}
      />
      <div className="hide-scrollbar w-full overflow-x-auto">
        <div className="relative min-w-full">
          <table className="w-full table-auto whitespace-nowrap">
            <thead>
              <tr>
                <th className={cn(thClassName, 'sticky left-0 z-10')}>
                  <div className="bg-def-100">
                    <div className="center-center -mt-3 h-10">Date</div>
                  </div>
                </th>
                <th className={cn(thClassName, 'pr-1')}>Total profiles</th>
                {data[0]?.values.map((column, index) => (
                  <th
                    className={cn(thClassName, 'capitalize')}
                    key={index.toString()}
                  >
                    {index === 0 ? `< ${interval} 1` : `${interval} ${index}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const values = isPercentage ? row.percentages : row.values;
                return (
                  <tr key={row.cohort_interval}>
                    <td className="sticky left-0 z-10 w-36 bg-card p-0">
                      <div className="center-center h-10 px-4 font-medium text-muted-foreground">
                        {row.cohort_interval}
                      </div>
                    </td>
                    <td className="min-w-12 p-0">
                      <div className={cn('rounded px-3 font-medium font-mono')}>
                        {number.format(row?.sum)}
                        {row.cohort_interval ===
                          rowWithHigestSum?.cohort_interval && ' 🚀'}
                      </div>
                    </td>
                    {values.map((value, index) => {
                      const { opacity, backgroundClassName } =
                        getBackground(value);
                      return (
                        <td
                          className="min-w-24 p-0"
                          key={row.cohort_interval + index.toString()}
                        >
                          <div
                            className={cn(
                              'center-center relative h-10 font-mono hover:shadow-[inset_0_0_0_2px_rgb(255,255,255)]',
                              opacity > 0.7 &&
                                'text-white [text-shadow:_0_0_3px_rgb(0_0_0_/_20%)]'
                            )}
                          >
                            <div
                              className={cn(
                                backgroundClassName,
                                'absolute inset-0 h-full w-full'
                              )}
                              style={{
                                opacity,
                              }}
                            />
                            <div className="relative">
                              {number.formatWithUnit(value, unit)}
                              {value === highestValue && ' 🚀'}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CohortTable;
