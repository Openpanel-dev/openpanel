import { ChevronRightIcon } from 'lucide-react';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';

export const Metric = ({
  label,
  value,
  enhancer,
  className,
}: {
  label: string;
  value: React.ReactNode;
  enhancer?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('col flex-1 justify-between gap-1', className)}>
    <div className="text-muted-foreground text-sm">{label}</div>
    <div className="row items-center justify-between gap-2">
      <div className="font-mono font-semibold">{value}</div>
      {enhancer && <div>{enhancer}</div>}
    </div>
  </div>
);

export function Summary({ data }: { data: RouterOutputs['chart']['funnel'] }) {
  const number = useNumber();
  const highestConversion = data.current
    .slice(0)
    .sort((a, b) => b.lastStep.percent - a.lastStep.percent)[0];
  const highestCount = data.current
    .slice(0)
    .sort((a, b) => b.lastStep.count - a.lastStep.count)[0];
  return (
    <div className="grid grid-cols-2 gap-4">
      {highestConversion && (
        <div className="card row items-center p-4 py-3">
          <Metric
            label="Highest conversion rate"
            value={
              <ChartName breakdowns={highestConversion.breakdowns ?? []} />
            }
          />
          <span className="font-mono font-semibold text-xl">
            {number.formatWithUnit(
              highestConversion.lastStep.percent / 100,
              '%'
            )}
          </span>
        </div>
      )}
      {highestCount && (
        <div className="card row items-center p-4 py-3">
          <Metric
            label="Most conversions"
            value={<ChartName breakdowns={highestCount.breakdowns ?? []} />}
          />
          <span className="font-mono font-semibold text-xl">
            {number.format(highestCount.lastStep.count)}
          </span>
        </div>
      )}
    </div>
  );
}

function ChartName({
  breakdowns,
  className,
}: {
  breakdowns: string[];
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2 font-medium', className)}>
      {breakdowns.map((name, index) => {
        return (
          <>
            {index !== 0 && <ChevronRightIcon className="size-3" />}
            <span key={name}>{name}</span>
          </>
        );
      })}
    </div>
  );
}
