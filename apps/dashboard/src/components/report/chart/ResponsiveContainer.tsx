import { cn } from '@/utils/cn';
import AutoSizer from 'react-virtualized-auto-sizer';

import { useChartContext } from './ChartProvider';

interface ResponsiveContainerProps {
  children: (props: { width: number; height: number }) => React.ReactNode;
}

export function ResponsiveContainer({ children }: ResponsiveContainerProps) {
  const { editMode } = useChartContext();
  const maxHeight = 300;
  const minHeight = 200;
  return (
    <div
      style={{
        maxHeight,
        minHeight,
      }}
      className={cn('aspect-video w-full max-sm:-mx-3', editMode && 'card p-4')}
    >
      <AutoSizer disableHeight>
        {({ width }) =>
          children({
            width,
            height: Math.min(
              Math.max(width * 0.5625, minHeight),
              // we add p-4 (16px) padding in edit mode
              editMode ? maxHeight - 16 : maxHeight
            ),
          })
        }
      </AutoSizer>
    </div>
  );
}
