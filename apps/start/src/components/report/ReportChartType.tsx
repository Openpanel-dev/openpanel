import type { IChartType } from '@openpanel/core/modules/report/report.constants';
import { chartTypes } from '@openpanel/core/modules/report/report.constants';
import {
  AreaChartIcon,
  ChartBarIcon,
  ChartColumnIncreasingIcon,
  ConeIcon,
  GaugeIcon,
  GitBranchIcon,
  Globe2Icon,
  LineChartIcon,
  type LucideIcon,
  PieChartIcon,
  TrendingUpIcon,
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
import { objectToZodEnums } from '@/utils/object-to-zod-enums';

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
    sankey: GitBranchIcon,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn('justify-start', className)}
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
