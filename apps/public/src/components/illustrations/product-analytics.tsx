'use client';
import { cn } from '@/lib/utils';
import { ResponsiveFunnel } from '@nivo/funnel';
import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion, useSpring } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

function useFunnelSteps() {
  const { resolvedTheme } = useTheme();
  return [
    {
      id: 'Visitors',
      label: 'Visitors',
      value: 10000,
      percentage: 100,
      color: resolvedTheme === 'dark' ? '#333' : '#888',
    },
    {
      id: 'Add to cart',
      label: 'Add to cart',
      value: 7000,
      percentage: 32,
      color: resolvedTheme === 'dark' ? '#222' : '#999',
    },
    {
      id: 'Checkout',
      label: 'Checkout',
      value: 5000,
      percentage: 8.9,
      color: resolvedTheme === 'dark' ? '#111' : '#e1e1e1',
    },
  ];
}

export function ProductAnalyticsIllustration() {
  return (
    <div className="aspect-video">
      <FunnelVisualization />
    </div>
  );
}

export const PartLabel = ({ part }: { part: any }) => {
  const { resolvedTheme } = useTheme();
  return (
    <g transform={`translate(${part.x}, ${part.y})`}>
      <text
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          fill: resolvedTheme === 'dark' ? '#fff' : '#000',
          pointerEvents: 'none',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {part.data.label}
      </text>
    </g>
  );
};

function Labels(props: any) {
  return props.parts.map((part: any) => (
    <PartLabel key={part.data.id} part={part} />
  ));
}

function FunnelVisualization() {
  const funnelSteps = useFunnelSteps();
  const colors = funnelSteps.map((stage) => stage.color);
  const nivoData = funnelSteps.map((stage) => ({
    id: stage.id,
    value: stage.value,
    label: stage.label,
  }));

  return (
    <div className="w-full h-full">
      <ResponsiveFunnel
        data={nivoData}
        margin={{ top: 20, right: 0, bottom: 20, left: 0 }}
        direction="horizontal"
        shapeBlending={0.6}
        colors={colors}
        enableBeforeSeparators={false}
        enableAfterSeparators={false}
        beforeSeparatorLength={0}
        afterSeparatorLength={0}
        afterSeparatorOffset={0}
        beforeSeparatorOffset={0}
        currentPartSizeExtension={5}
        borderWidth={20}
        currentBorderWidth={15}
        tooltip={() => null}
        layers={['parts', Labels]}
      />
    </div>
  );
}
