import { useNumber } from '@/hooks/useNumerFormatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { max, min } from '@openpanel/common';
import { useReportChartContext } from '../context';

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
    (row) => row.sum === max(data.map((row) => row.sum)),
  );

  const getBackground = (value: number | undefined) => {
    if (!value)
      return {
        backgroundClassName: '',
        opacity: 0,
      };

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
    <div className="relative card overflow-hidden">
      <div
        className={'h-10 absolute left-0 right-0 top-px bg-def-100 border-b'}
      />
      <div className="w-full overflow-x-auto hide-scrollbar">
        <div className="min-w-full relative">
          <table className="w-full table-auto whitespace-nowrap">
            <thead>
              <tr>
                <th className={cn(thClassName, 'sticky left-0 z-10')}>
                  <div className="bg-def-100">
                    <div className="h-10 center-center -mt-3">Date</div>
                  </div>
                </th>
                <th className={cn(thClassName, 'pr-1')}>Total profiles</th>
                {data[0]?.values.map((column, index) => (
                  <th
                    key={index.toString()}
                    className={cn(thClassName, 'capitalize')}
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
                    <td className="sticky left-0 bg-card z-10 w-36 p-0">
                      <div className="h-10 center-center font-medium text-muted-foreground px-4">
                        {row.cohort_interval}
                      </div>
                    </td>
                    <td className="p-0 min-w-12">
                      <div className={cn('font-mono rounded px-3 font-medium')}>
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
                          key={row.cohort_interval + index.toString()}
                          className="p-0 min-w-24"
                        >
                          <div
                            className={cn(
                              'h-10 center-center font-mono hover:shadow-[inset_0_0_0_2px_rgb(255,255,255)] relative',
                              opacity > 0.7 &&
                                'text-white [text-shadow:_0_0_3px_rgb(0_0_0_/_20%)]',
                            )}
                          >
                            <div
                              className={cn(
                                backgroundClassName,
                                'w-full h-full inset-0 absolute',
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
