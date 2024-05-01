import { Suspense } from 'react';
import { ChartLoading } from '@/components/report/chart/ChartLoading';
import { Widget, WidgetHead } from '@/components/widget';

type Props = Record<string, unknown> & {
  className?: string;
};

const withLoadingWidget = <P extends Props>(
  Component: React.ComponentType<P>
) => {
  const WithLoadingWidget: React.ComponentType<P> = (props) => {
    return (
      <Suspense
        fallback={
          <Widget className={props.className}>
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
