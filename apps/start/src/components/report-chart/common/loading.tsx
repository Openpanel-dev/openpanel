import { AnimatePresence, motion } from 'framer-motion';
import {
  ActivityIcon,
  AlarmClockIcon,
  BarChart2Icon,
  BarChartIcon,
  ChartLineIcon,
  ChartPieIcon,
  LineChartIcon,
  MessagesSquareIcon,
  PieChartIcon,
  TrendingUpIcon,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useReportChartContext } from '../context';
import { cn } from '@/utils/cn';

const icons = [
  { Icon: ActivityIcon, color: 'text-chart-6' },
  { Icon: BarChart2Icon, color: 'text-chart-9' },
  { Icon: ChartLineIcon, color: 'text-chart-0' },
  { Icon: AlarmClockIcon, color: 'text-chart-1' },
  { Icon: ChartPieIcon, color: 'text-chart-2' },
  { Icon: MessagesSquareIcon, color: 'text-chart-3' },
  { Icon: BarChartIcon, color: 'text-chart-4' },
  { Icon: TrendingUpIcon, color: 'text-chart-5' },
  { Icon: PieChartIcon, color: 'text-chart-7' },
  { Icon: LineChartIcon, color: 'text-chart-8' },
];

export function ReportChartLoading({ things }: { things?: boolean }) {
  const { isEditMode } = useReportChartContext();
  const [currentIconIndex, setCurrentIconIndex] = React.useState(0);
  const [isSlow, setSlow] = useState(false);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIconIndex((prevIndex) => (prevIndex + 1) % icons.length);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentIconIndex >= 3) {
      setSlow(true);
    }
  }, [currentIconIndex]);

  const { Icon, color } = icons[currentIconIndex]!;

  return (
    <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
      <div
        className={
          'center-center relative flex h-full w-full overflow-hidden rounded bg-def-100'
        }
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            animate={{ x: 0, opacity: 1 }}
            className={cn('absolute size-1/3', color)}
            exit={{ x: '-100%', opacity: 0 }}
            initial={{ x: '100%', opacity: 0 }}
            key={currentIconIndex}
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 30,
              duration: 0.5,
            }}
          >
            <Icon className="h-full w-full" />
          </motion.div>
        </AnimatePresence>

        <div
          className={cn(
            'absolute top-3/4 text-muted-foreground opacity-0 transition-opacity',
            isSlow && 'opacity-100'
          )}
        >
          Stay calm, its coming 🙄
        </div>
      </div>
    </div>
  );
}
