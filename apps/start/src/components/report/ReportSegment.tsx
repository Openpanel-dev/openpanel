import { chartSegments } from '@openpanel/constants';
import { type IChartEventSegment, mapKeys } from '@openpanel/validation';
import {
  ActivityIcon,
  Building2Icon,
  ClockIcon,
  EqualApproximatelyIcon,
  type LucideIcon,
  SigmaIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  UserCheck2Icon,
  UserCheckIcon,
  UsersIcon,
} from 'lucide-react';
import { Button } from '../ui/button';
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

interface ReportChartTypeProps {
  className?: string;
  value: IChartEventSegment;
  onChange: (segment: IChartEventSegment) => void;
}
export function ReportSegment({
  className,
  value,
  onChange,
}: ReportChartTypeProps) {
  const items = mapKeys(chartSegments).map((key) => ({
    label: chartSegments[key],
    value: key,
  }));

  const Icons: Record<IChartEventSegment, LucideIcon> = {
    event: ActivityIcon,
    user: UsersIcon,
    session: ClockIcon,
    group: Building2Icon,
    user_average: UserCheck2Icon,
    one_event_per_user: UserCheckIcon,
    property_sum: SigmaIcon,
    property_average: EqualApproximatelyIcon,
    property_max: TrendingUpIcon,
    property_min: TrendingDownIcon,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn('justify-start text-sm', className)}
          icon={Icons[value]}
          variant="outline"
        >
          {items.find((item) => item.value === value)?.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Available charts</DropdownMenuLabel>
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
