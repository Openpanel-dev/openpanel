import { createContext, memo, useContext, useMemo } from 'react';

export interface ChartContextType {
  editMode: boolean;
}

type ChartProviderProps = {
  children: React.ReactNode;
} & ChartContextType;

const ChartContext = createContext<ChartContextType>({
  editMode: false,
});

export function ChartProvider({ children, editMode }: ChartProviderProps) {
  return (
    <ChartContext.Provider
      value={useMemo(
        () => ({
          editMode,
        }),
        [editMode]
      )}
    >
      {children}
    </ChartContext.Provider>
  );
}

export function withChartProivder<ComponentProps>(
  WrappedComponent: React.FC<ComponentProps>
) {
  const WithChartProvider = (props: ComponentProps & ChartContextType) => {
    return (
      <ChartProvider {...props}>
        <WrappedComponent {...props} />
      </ChartProvider>
    );
  };

  WithChartProvider.displayName = `WithChartProvider(${
    WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component'
  })`;

  return memo(WithChartProvider);
}

export function useChartContext() {
  return useContext(ChartContext);
}
