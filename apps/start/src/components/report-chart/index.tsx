import { mergeDeepRight } from 'ramda';
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { useInViewport } from 'react-in-viewport';
import { ReportAreaChart } from './area';
import { ReportBarChart } from './bar';
import { getSizeTier } from './common/chart-size';
import type { ReportChartProps } from './context';
import { ReportChartProvider } from './context';
import { ReportConversionChart } from './conversion';
import { ReportDistributionChart } from './distribution';
import { ReportFunnelChart } from './funnel';
import { ReportHistogramChart } from './histogram';
import { ReportLineChart } from './line';
import { ReportMapChart } from './map';
import { ReportMetricChart } from './metric';
import { ReportPieChart } from './pie';
import { ReportRetentionChart } from './retention';
import { ReportSankeyChart } from './sankey';
import { useElementSize } from '@/hooks/use-element-size';
import { cn } from '@/utils/cn';

export const ReportChart = ({ lazy = true, ...props }: ReportChartProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const once = useRef(false);
  const { inViewport } = useInViewport(
    ref as RefObject<HTMLElement>,
    undefined,
    {
      disconnectOnLeave: true,
    }
  );

  useEffect(() => {
    if (inViewport) {
      once.current = true;
    }
  }, [inViewport]);

  const loaded = lazy ? once.current || inViewport : true;

  const [measureRef, size] = useElementSize();
  const setRootRef = useCallback(
    (element: HTMLDivElement | null) => {
      ref.current = element;
      return measureRef(element);
    },
    [measureRef]
  );
  // Before the first measurement the chart renders with full chrome.
  const sizeTier = size.width > 0 ? getSizeTier(size.width) : 'wide';

  const renderReportChart = () => {
    switch (props.report.chartType) {
      case 'linear':
        return <ReportLineChart />;
      case 'bar':
        return <ReportBarChart />;
      case 'area':
        return <ReportAreaChart />;
      case 'histogram':
        return <ReportHistogramChart />;
      case 'pie':
        return <ReportPieChart />;
      case 'map':
        return <ReportMapChart />;
      case 'metric':
        return <ReportMetricChart />;
      case 'funnel':
        return <ReportFunnelChart />;
      case 'retention':
        return <ReportRetentionChart />;
      case 'conversion':
        return <ReportConversionChart />;
      case 'sankey':
        return <ReportSankeyChart />;
      case 'distribution':
        return <ReportDistributionChart />;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn('w-full', props.layout === 'fill' && 'h-full min-h-0')}
      ref={setRootRef}
    >
      <ReportChartProvider
        {...mergeDeepRight(
          { options: {}, isEditMode: false, layout: 'aspect' as const },
          props
        )}
        isLazyLoading={!loaded}
        sizeTier={sizeTier}
      >
        {renderReportChart()}
      </ReportChartProvider>
    </div>
  );
};
