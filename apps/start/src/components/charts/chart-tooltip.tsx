import { createContext, useContext as useBaseContext } from 'react';

import { Tooltip as RechartsTooltip, type TooltipProps } from 'recharts';

export function createChartTooltip<
  PropsFromTooltip extends Record<string, unknown>,
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
      <div className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-background/80 p-3  shadow-xl backdrop-blur-sm">
        <Tooltip data={data} context={context} {...tooltip} />
      </div>
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
