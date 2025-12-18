import { cn } from '@/utils/cn';
import { createContext, useContext as useBaseContext } from 'react';

import { Tooltip as RechartsTooltip, type TooltipProps } from 'recharts';

export const ChartTooltipContainer = ({
  children,
  className,
}: { children: React.ReactNode; className?: string }) => {
  return (
    <div
      className={cn(
        'min-w-[180px] col gap-2 rounded-xl border bg-background/80 p-3  shadow-xl backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  );
};

export const ChartTooltipHeader = ({
  children,
}: { children: React.ReactNode }) => {
  return <div className="flex justify-between gap-8">{children}</div>;
};

export const ChartTooltipItem = ({
  children,
  color,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  color: string;
  className?: string;
  innerClassName?: string;
}) => {
  return (
    <div className={cn('flex gap-2', className)}>
      <div className="w-[3px] rounded-full" style={{ background: color }} />
      <div className={cn('col flex-1 gap-1', innerClassName)}>{children}</div>
    </div>
  );
};

export function createChartTooltip<
  PropsFromTooltip,
  PropsFromContext extends Record<string, unknown>,
>(
  Tooltip: React.ComponentType<
    {
      context: PropsFromContext;
      data: PropsFromTooltip[];
    } & TooltipProps<number, string>
  >,
) {
  const context = createContext<PropsFromContext | null>(null);
  const useContext = () => {
    const value = useBaseContext(context);
    if (!value) {
      throw new Error('ChartTooltip context not found');
    }
    return value;
  };

  const InnerTooltip = (tooltip: TooltipProps<number, string>) => {
    const context = useContext();
    const data = tooltip.payload?.map((p) => p.payload) ?? [];

    if (!data || !tooltip.active) {
      return null;
    }

    return (
      <ChartTooltipContainer>
        <Tooltip data={data} context={context} {...tooltip} />
      </ChartTooltipContainer>
    );
  };

  return {
    TooltipProvider: ({
      children,
      ...value
    }: {
      children: React.ReactNode;
    } & PropsFromContext) => {
      return (
        <context.Provider value={value as unknown as PropsFromContext}>
          {children}
        </context.Provider>
      );
    },
    Tooltip: (props: TooltipProps<number, string>) => {
      return (
        <RechartsTooltip {...props} content={<InnerTooltip {...props} />} />
      );
    },
  };
}
