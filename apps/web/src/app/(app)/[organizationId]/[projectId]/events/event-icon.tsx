import { cn } from '@/utils/cn';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { ActivityIcon, BotIcon, MonitorPlayIcon } from 'lucide-react';

const variants = cva('flex items-center justify-center shrink-0', {
  variants: {
    size: {
      sm: 'w-6 h-6 rounded',
      default: 'w-12 h-12 rounded-xl',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

type EventIconProps = VariantProps<typeof variants> & {
  name: string;
  className?: string;
};

const records = {
  default: { Icon: BotIcon, text: 'text-chart-0', bg: 'bg-chart-0/10' },
  screen_view: {
    Icon: MonitorPlayIcon,
    text: 'text-chart-3',
    bg: 'bg-chart-3/10',
  },
  session_start: {
    Icon: ActivityIcon,
    text: 'text-chart-2',
    bg: 'bg-chart-2/10',
  },
};

export function EventIcon({ className, name, size }: EventIconProps) {
  const { Icon, text, bg } =
    name in records ? records[name as keyof typeof records] : records.default;

  return (
    <div className={cn(variants({ size }), bg, className)}>
      <Icon size={20} className={text} />
    </div>
  );
}
