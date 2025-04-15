'use client';

import { mergeDeepRight } from 'ramda';
import React, { memo, useEffect, useRef } from 'react';
import { useInViewport } from 'react-in-viewport';

import { shallowEqual } from 'react-redux';
import { ReportAreaChart } from './area';
import { ReportBarChart } from './bar';
import type { ReportChartProps } from './context';
import { ReportChartProvider } from './context';
import { ReportConversionChart } from './conversion';
import { ReportFunnelChart } from './funnel';
import { ReportHistogramChart } from './histogram';
import { ReportLineChart } from './line';
import { ReportMapChart } from './map';
import { ReportMetricChart } from './metric';
import { ReportPieChart } from './pie';
import { ReportRetentionChart } from './retention';

export const ReportChart = ({ lazy = true, ...props }: ReportChartProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const once = useRef(false);
  const { inViewport } = useInViewport(ref, undefined, {
    disconnectOnLeave: true,
  });

  useEffect(() => {
    if (inViewport) {
      once.current = true;
    }
  }, [inViewport]);

  const loaded = lazy ? once.current || inViewport : true;

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
      default:
        return null;
    }
  };

  return (
    <div ref={ref}>
      <ReportChartProvider
        {...mergeDeepRight({ options: {}, isEditMode: false }, props)}
        isLazyLoading={!loaded}
      >
        {renderReportChart()}
      </ReportChartProvider>
    </div>
  );
};
