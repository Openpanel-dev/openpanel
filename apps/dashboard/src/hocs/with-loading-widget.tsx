import { Suspense } from 'react';
import { ChartLoading } from '@/components/report/chart/ChartLoading';
import { Widget, WidgetHead } from '@/components/widget';
import { cn } from '@/utils/cn';

const withLoadingWidget = <P,>(Component: React.ComponentType<P>) => {
  const WithLoadingWidget: React.ComponentType<P> = (props) => {
    return (
      <Suspense
        fallback={
          <Widget
            className={cn(
              'w-full',
              props &&
                typeof props === 'object' &&
                'className' in props &&
                typeof props.className === 'string' &&
                props?.className
            )}
          >
            <WidgetHead>
              <span className="title">Loading...</span>
            </WidgetHead>
            <ChartLoading />
          </Widget>
        }
      >
        <Component {...(props as any)} />
      </Suspense>
    );
  };

  WithLoadingWidget.displayName = `WithLoadingWidget(${Component.displayName})`;

  return WithLoadingWidget;
};

export default withLoadingWidget;
