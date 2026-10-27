import type { IPerUserAggregation } from '@openpanel/core/modules/report/report.constants';
import { perUserAggregations } from '@openpanel/core/modules/report/report.constants';
import {
  ActivityIcon,
  EqualApproximatelyIcon,
  FingerprintIcon,
  type LucideIcon,
  PercentIcon,
  SigmaIcon,
  SplitIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { Button, type ButtonProps } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';
import { mapKeys } from '@/utils/object-to-zod-enums';

const Icons: Record<IPerUserAggregation, LucideIcon> = {
  count: ActivityIcon,
  sum: SigmaIcon,
  avg: EqualApproximatelyIcon,
  min: TrendingDownIcon,
  max: TrendingUpIcon,
  median: SplitIcon,
  p90: PercentIcon,
  p95: PercentIcon,
  p99: PercentIcon,
  distinct_count: FingerprintIcon,
};

interface ReportPerUserProps {
  className?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  value: IPerUserAggregation;
  onChange: (aggregation: IPerUserAggregation) => void;
}

/** What a distribution chart reduces each user's events to before bucketing them. */
export function ReportPerUser({
  className,
  variant = 'outline',
  size,
  value,
  onChange,
}: ReportPerUserProps) {
  const items = mapKeys(perUserAggregations).map((key) => ({
    label: perUserAggregations[key],
    value: key,
  }));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn('justify-start text-sm', className)}
          icon={Icons[value]}
          size={size}
          variant={variant}
        >
          {perUserAggregations[value]} per user
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Value per user</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {items.map((item) => {
            const Icon = Icons[item.value];
            return (
              <DropdownMenuItem
                className="group"
                key={item.value}
                onClick={() => onChange(item.value)}
              >
                {item.label}
                <DropdownMenuShortcut>
                  <Icon className="size-4 transition-all group-hover:rotate-12 group-hover:scale-125 group-hover:text-blue-500" />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
