'use client';
import { ResponsiveFunnel } from '@nivo/funnel';
import { useTheme } from 'next-themes';

function useFunnelSteps() {
  const { resolvedTheme } = useTheme();
  return [
    {
      id: 'Visitors',
      label: 'Visitors',
      value: 10_000,
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
        dominantBaseline="central"
        style={{
          fill: resolvedTheme === 'dark' ? '#fff' : '#000',
          pointerEvents: 'none',
          fontSize: 12,
          fontWeight: 500,
        }}
        textAnchor="middle"
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
    <div className="h-full w-full">
      <ResponsiveFunnel
        afterSeparatorLength={0}
        afterSeparatorOffset={0}
        beforeSeparatorLength={0}
        beforeSeparatorOffset={0}
        borderWidth={20}
        colors={colors}
        currentBorderWidth={15}
        currentPartSizeExtension={5}
        data={nivoData}
        direction="horizontal"
        enableAfterSeparators={false}
        enableBeforeSeparators={false}
        layers={['parts', Labels]}
        margin={{ top: 20, right: 0, bottom: 20, left: 0 }}
        shapeBlending={0.6}
        tooltip={() => null}
      />
    </div>
  );
}
