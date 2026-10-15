'use client';

import { geoCentroid } from 'd3-geo';
import { motion, useTransform } from 'motion/react';
import { memo, useCallback, useMemo } from 'react';
import { useEnterComplete } from '../use-enter-complete';
import { useMountProgress } from '../use-mount-progress';
import {
  type ChoroplethFeature as ChoroplethFeatureType,
  defaultChoroplethColors,
  useChoroplethInteraction,
  useChoroplethStable,
} from './choropleth-context';

export interface ChoroplethFeatureProps {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fadedOpacity?: number;
  getFeatureColor?: (feature: ChoroplethFeatureType, index: number) => string;
  patterns?: React.ReactNode;
  getFeaturePattern?: (
    feature: ChoroplethFeatureType,
    index: number
  ) => string | null | undefined;
}

interface FeatureRecord {
  index: number;
  path: string;
  fill: string;
  feature: ChoroplethFeatureType;
  centroid: { x: number; y: number } | null;
}

function resolveFeatureFill(
  feature: ChoroplethFeatureType,
  index: number,
  fill: string | undefined,
  getFeatureColor: ChoroplethFeatureProps['getFeatureColor'],
  getFeaturePattern: ChoroplethFeatureProps['getFeaturePattern']
): string {
  const patternId = getFeaturePattern?.(feature, index);
  if (patternId) {
    return `url(#${patternId})`;
  }
  if (fill) {
    return fill;
  }
  if (getFeatureColor) {
    return getFeatureColor(feature, index);
  }
  return (
    defaultChoroplethColors[index % defaultChoroplethColors.length] ??
    'var(--chart-1)'
  );
}

const StaticFeatureLayer = memo(function StaticFeatureLayer({
  records,
  stroke,
  strokeWidth,
  baseOpacity,
  dimOpacity,
  hoveredIndex,
  onFeatureEnter,
  onFeatureLeave,
}: {
  records: FeatureRecord[];
  stroke: string;
  strokeWidth: number;
  baseOpacity: number;
  dimOpacity: number;
  hoveredIndex: number | null;
  onFeatureEnter: (record: FeatureRecord) => void;
  onFeatureLeave: () => void;
}) {
  const isDimmed = hoveredIndex !== null;

  if (!isDimmed) {
    return (
      <g opacity={baseOpacity}>
        {records.map((record) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: SVG path used as hover hitbox
          <path
            className="cursor-pointer"
            d={record.path}
            fill={record.fill}
            key={`base-${record.index}`}
            onMouseEnter={() => onFeatureEnter(record)}
            onMouseLeave={onFeatureLeave}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        ))}
      </g>
    );
  }

  const highlighted = records.find((record) => record.index === hoveredIndex);

  return (
    <>
      <g opacity={dimOpacity} style={{ transition: 'opacity 0.18s ease-out' }}>
        {records
          .filter((record) => record.index !== hoveredIndex)
          .map((record) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: SVG path used as hover hitbox
            <path
              className="cursor-pointer"
              d={record.path}
              fill={record.fill}
              key={`base-${record.index}`}
              onMouseEnter={() => onFeatureEnter(record)}
              onMouseLeave={onFeatureLeave}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          ))}
      </g>
      {highlighted ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: SVG path used as hover hitbox
        <path
          className="cursor-pointer"
          d={highlighted.path}
          fill={highlighted.fill}
          key={`highlight-${highlighted.index}`}
          onMouseEnter={() => onFeatureEnter(highlighted)}
          onMouseLeave={onFeatureLeave}
          opacity={1}
          stroke={stroke}
          strokeWidth={strokeWidth}
          style={{ transition: 'opacity 0.18s ease-out' }}
        />
      ) : null}
    </>
  );
});

const EnterFeatureLayer = memo(function EnterFeatureLayer({
  records,
  stroke,
  strokeWidth,
  baseOpacity,
  dimOpacity,
  hoveredIndex,
  onFeatureEnter,
  onFeatureLeave,
  revealEpoch,
}: {
  records: FeatureRecord[];
  stroke: string;
  strokeWidth: number;
  baseOpacity: number;
  dimOpacity: number;
  hoveredIndex: number | null;
  onFeatureEnter: (record: FeatureRecord) => void;
  onFeatureLeave: () => void;
  revealEpoch: number;
}) {
  const { enterTransition, animationDuration } = useChoroplethStable();
  const mountProgress = useMountProgress(
    enterTransition,
    0,
    `choropleth-layer-${revealEpoch}`
  );
  const enterComplete = useEnterComplete(mountProgress);
  const layerOpacity = useTransform(mountProgress, (t) => t * baseOpacity);

  if (enterComplete) {
    return (
      <StaticFeatureLayer
        baseOpacity={baseOpacity}
        dimOpacity={dimOpacity}
        hoveredIndex={hoveredIndex}
        onFeatureEnter={onFeatureEnter}
        onFeatureLeave={onFeatureLeave}
        records={records}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  return (
    <motion.g
      key={`enter-${revealEpoch}`}
      opacity={layerOpacity}
      transition={{
        duration: animationDuration / 1000,
        ease: 'easeOut',
      }}
    >
      {records.map((record) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: SVG path used as hover hitbox
        <path
          className="cursor-pointer"
          d={record.path}
          fill={record.fill}
          key={`enter-${record.index}`}
          onMouseEnter={() => onFeatureEnter(record)}
          onMouseLeave={onFeatureLeave}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ))}
    </motion.g>
  );
});

export const ChoroplethFeature = memo(function ChoroplethFeature({
  fill,
  stroke = 'var(--background)',
  strokeWidth = 0.5,
  fadedOpacity = 0.4,
  getFeatureColor,
  patterns,
  getFeaturePattern,
}: ChoroplethFeatureProps) {
  const {
    features,
    featurePaths,
    pathGenerator,
    projectPoint,
    isLoaded,
    revealEpoch,
    width,
    height,
  } = useChoroplethStable();
  const { hoveredFeatureIndex, setHoveredFeatureIndex, setTooltipData } =
    useChoroplethInteraction();

  const featureCentroids = useMemo(() => {
    return features.map((feature) => {
      try {
        const centroid = geoCentroid(feature);
        if (
          centroid &&
          !Number.isNaN(centroid[0]) &&
          !Number.isNaN(centroid[1])
        ) {
          const projected = projectPoint(centroid as [number, number]);
          if (projected) {
            const padding = 60;
            return {
              x: Math.max(padding, Math.min(width - padding, projected[0])),
              y: Math.max(padding, Math.min(height - padding, projected[1])),
            };
          }
        }
      } catch {
        // Some geometries may not have valid centroids
      }
      return null;
    });
  }, [features, projectPoint, width, height]);

  const records = useMemo(() => {
    const items: FeatureRecord[] = [];
    for (let index = 0; index < features.length; index++) {
      const feature = features[index];
      if (!feature) {
        continue;
      }

      const path = featurePaths[index] ?? pathGenerator(feature);
      if (!path) {
        continue;
      }

      items.push({
        index,
        path,
        fill: resolveFeatureFill(
          feature,
          index,
          fill,
          getFeatureColor,
          getFeaturePattern
        ),
        feature,
        centroid: featureCentroids[index] ?? null,
      });
    }
    return items;
  }, [
    featureCentroids,
    featurePaths,
    features,
    fill,
    getFeatureColor,
    getFeaturePattern,
    pathGenerator,
  ]);

  const handleFeatureEnter = useCallback(
    (record: FeatureRecord) => {
      setHoveredFeatureIndex(record.index);
      setTooltipData({
        featureIndex: record.index,
        x: record.centroid?.x ?? width / 2,
        y: record.centroid?.y ?? height / 2,
        feature: record.feature,
      });
    },
    [height, setHoveredFeatureIndex, setTooltipData, width]
  );

  const handleFeatureLeave = useCallback(() => {
    setHoveredFeatureIndex(null);
    setTooltipData(null);
  }, [setHoveredFeatureIndex, setTooltipData]);

  const layerProps = {
    baseOpacity: 0.85,
    dimOpacity: fadedOpacity,
    hoveredIndex: hoveredFeatureIndex,
    onFeatureEnter: handleFeatureEnter,
    onFeatureLeave: handleFeatureLeave,
    records,
    stroke,
    strokeWidth,
  };

  return (
    <g className="choropleth-features">
      {patterns ? <defs>{patterns}</defs> : null}
      {isLoaded ? (
        <StaticFeatureLayer {...layerProps} />
      ) : (
        <EnterFeatureLayer {...layerProps} revealEpoch={revealEpoch} />
      )}
    </g>
  );
});

ChoroplethFeature.displayName = 'ChoroplethFeature';

export default ChoroplethFeature;
