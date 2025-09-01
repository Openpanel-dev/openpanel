import { useDispatch, useSelector } from '@/redux';
import {
  AreaChartIcon,
  ChartBarIcon,
  ChartColumnIncreasingIcon,
  ConeIcon,
  GaugeIcon,
  Globe2Icon,
  LineChartIcon,
  type LucideIcon,
  PieChartIcon,
  TrendingUpIcon,
  UsersIcon,
} from 'lucide-react';

import { chartTypes } from '@openpanel/constants';
import { type IChartType, objectToZodEnums } from '@openpanel/validation';

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
import { Button } from '../ui/button';
import { changeChartType } from './reportSlice';

interface ReportChartTypeProps {
  className?: string;
  value: IChartType;
  onChange: (type: IChartType) => void;
}
export function ReportChartType({
  className,
  value,
  onChange,
}: ReportChartTypeProps) {
  const items = objectToZodEnums(chartTypes).map((key) => ({
    label: chartTypes[key],
    value: key,
  }));

  const Icons: Record<keyof typeof chartTypes, LucideIcon> = {
    area: AreaChartIcon,
    bar: ChartBarIcon,
    pie: PieChartIcon,
    funnel: ((props) => (
      <ConeIcon className={cn('rotate-180', props.className)} />
    )) as LucideIcon,
    histogram: ChartColumnIncreasingIcon,
    linear: LineChartIcon,
    metric: GaugeIcon,
    retention: UsersIcon,
    map: Globe2Icon,
    conversion: TrendingUpIcon,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          icon={Icons[value]}
          className={cn('justify-start', className)}
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
                key={item.value}
                onClick={() => onChange(item.value)}
                className="group"
              >
                {item.label}
                <DropdownMenuShortcut>
                  <Icon className="size-4 group-hover:text-blue-500 group-hover:scale-125 transition-all group-hover:rotate-12" />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
