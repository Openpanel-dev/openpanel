import type { IChartLineType } from '@openpanel/core/modules/report/report.constants';
import { lineTypes } from '@openpanel/core/modules/report/report.constants';
import { CheckIcon, Tv2Icon } from 'lucide-react';
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
} from '../ui/dropdown-menu';
import { changeLineType } from './reportSlice';
import { useDispatch, useSelector } from '@/redux';
import { cn } from '@/utils/cn';
import { objectToZodEnums } from '@/utils/object-to-zod-enums';

interface ReportLineTypeProps {
  className?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}
export function ReportLineType({
  className,
  variant = 'outline',
  size,
}: ReportLineTypeProps) {
  const dispatch = useDispatch();
  const chartType = useSelector((state) => state.report.chartType);
  const type = useSelector((state) => state.report.lineType);

  if (
    chartType !== 'conversion' &&
    chartType !== 'linear' &&
    chartType !== 'area'
  ) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn('justify-start', className)}
          icon={Tv2Icon}
          size={size}
          variant={variant}
        >
          {lineTypes[type] ?? 'Line type'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-(--radix-dropdown-menu-content-available-height) w-56 overflow-y-auto">
        <DropdownMenuLabel>Line type</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {objectToZodEnums(lineTypes).map((key) => (
            <DropdownMenuItem
              key={key}
              onClick={() => dispatch(changeLineType(key as IChartLineType))}
            >
              {lineTypes[key]}
              {key === type && (
                <DropdownMenuShortcut>
                  <CheckIcon className="size-4" />
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
