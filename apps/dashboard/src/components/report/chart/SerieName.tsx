import { cn } from '@/utils/cn';
import { ChevronRightIcon } from 'lucide-react';

import { NOT_SET_VALUE } from '@openpanel/constants';

import { useChartContext } from './ChartProvider';

interface SerieNameProps {
  name: string | string[];
  className?: string;
}

export function SerieName({ name, className }: SerieNameProps) {
  const chart = useChartContext();
  if (Array.isArray(name)) {
    if (chart.renderSerieName) {
      return chart.renderSerieName(name);
    }
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {name.map((n, index) => {
          return (
            <>
              <span>{n || NOT_SET_VALUE}</span>
              {name.length - 1 > index && (
                <ChevronRightIcon className="text-muted-foreground" size={12} />
              )}
            </>
          );
        })}
      </div>
    );
  }

  if (chart.renderSerieName) {
    return chart.renderSerieName([name]);
  }

  return <>{name}</>;
}
