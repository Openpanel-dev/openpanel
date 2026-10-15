'use client';

import { Graticule } from '@visx/geo';
import { memo } from 'react';
import { useChoroplethStable } from './choropleth-context';

export interface ChoroplethGraticuleProps {
  /** Stroke color for graticule lines. Default: rgba(255,255,255,0.1) */
  stroke?: string;
  /** Stroke width for graticule lines. Default: 0.5 */
  strokeWidth?: number;
  /** Step intervals for graticule lines [longitude, latitude] in degrees. Default: [10, 10] */
  step?: [number, number];
}

export const ChoroplethGraticule = memo(function ChoroplethGraticule({
  stroke = 'rgba(255,255,255,0.1)',
  strokeWidth = 0.5,
  step,
}: ChoroplethGraticuleProps) {
  const { rawPathGenerator } = useChoroplethStable();

  return (
    <Graticule
      graticule={(g) => rawPathGenerator(g) || ''}
      step={step}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
});

ChoroplethGraticule.displayName = 'ChoroplethGraticule';

export default ChoroplethGraticule;
