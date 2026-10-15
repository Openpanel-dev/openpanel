'use client';

import { useCallback } from 'react';
import { useChartStable, useYScale } from './chart-context';
import type { ProjectionPoint } from './projection-utils';

export interface ProjectionLineEndMarkerProps {
  data: ProjectionPoint[];
  yAxisId?: string | number;
  stroke?: string;
  strokeOpacity?: number;
  radius?: number;
}

/** Renders the projection horizon dot outside the series reveal clip. */
export function ProjectionLineEndMarker({
  data,
  yAxisId,
  stroke = 'var(--chart-3)',
  strokeOpacity = 1,
  radius = 5,
}: ProjectionLineEndMarkerProps) {
  const { xScale, chartPhase, innerWidth } = useChartStable();
  const yScale = useYScale(yAxisId);

  const getX = useCallback(
    (point: ProjectionPoint) => xScale(point.date) ?? 0,
    [xScale]
  );
  const getY = useCallback(
    (point: ProjectionPoint) => yScale(point.value) ?? 0,
    [yScale]
  );

  const showStroke =
    chartPhase === 'revealing' ||
    chartPhase === 'ready' ||
    chartPhase === 'exitingReady';

  if (!showStroke || data.length < 2) {
    return null;
  }

  const endPoint = data.at(-1);
  if (!endPoint) {
    return null;
  }
  const edgePadding = radius + 1;
  const endX = Math.min(getX(endPoint), Math.max(0, innerWidth - edgePadding));
  const endY = getY(endPoint);

  return (
    <circle
      cx={endX}
      cy={endY}
      fill={stroke}
      fillOpacity={strokeOpacity}
      r={radius * 0.85}
    />
  );
}

ProjectionLineEndMarker.displayName = 'ProjectionLineEndMarker';

(
  ProjectionLineEndMarker as unknown as Record<string, boolean>
).__isPostOverlay = true;

export default ProjectionLineEndMarker;
