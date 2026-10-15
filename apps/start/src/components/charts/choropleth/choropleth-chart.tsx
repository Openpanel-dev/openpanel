'use client';

import { Mercator } from '@visx/geo';
import type { TransformMatrix } from '@visx/zoom';
import { Zoom } from '@visx/zoom';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Transition } from 'motion/react';
import React, {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { ParentSize } from '../chart-parent-size';
import {
  type ChoroplethFeature,
  type ChoroplethFeatureProperties,
  ChoroplethInteractionShell,
  ChoroplethStableProvider,
  ChoroplethZoomContext,
  type Margin,
  useChoroplethInteraction,
  type ZoomInstance,
} from './choropleth-context';
import { ChoroplethFeature as ChoroplethFeatureLayer } from './choropleth-feature';
import { ChoroplethGraticule as ChoroplethGraticuleLayer } from './choropleth-graticule';
import { ChoroplethTooltip as ChoroplethTooltipLayer } from './choropleth-tooltip';

export interface ChoroplethChartProps {
  /** GeoJSON FeatureCollection data */
  data: FeatureCollection<Geometry, ChoroplethFeatureProperties>;
  /** Chart margins */
  margin?: Partial<Margin>;
  /** Animation duration in milliseconds. Default: 800 */
  animationDuration?: number;
  /** Motion enter transition (spring or cubic-bezier tween). */
  enterTransition?: Transition;
  /** Signature of motion URL state — triggers enter replay when it changes. */
  revealSignature?: string;
  /** Aspect ratio as "width / height". Default: "16 / 9" */
  aspectRatio?: string;
  /** Projection scale. If not provided, auto-calculated based on width */
  scale?: number;
  /** Center coordinates [longitude, latitude]. Default: [0, 20] */
  center?: [number, number];
  /** Translate offset [x, y]. If not provided, auto-calculated to center */
  translate?: [number, number];
  /** Enable zoom and pan. Default: false */
  zoomEnabled?: boolean;
  /** Minimum zoom scale. Default: 0.5 */
  zoomMin?: number;
  /** Maximum zoom scale. Default: 4 */
  zoomMax?: number;
  /** Initial zoom transform */
  initialZoom?: TransformMatrix;
  /** Additional class name for the container */
  className?: string;
  /** Child components (ChoroplethFeature, ChoroplethGraticule, ChoroplethTooltip) */
  children: ReactNode;
}

const DEFAULT_MARGIN: Margin = { top: 0, right: 0, bottom: 0, left: 0 };

// Known SVG component displayNames
const SVG_COMPONENT_NAMES = new Set([
  'ChoroplethFeature',
  'ChoroplethGraticule',
  'ChoroplethTooltip',
]);

const SVG_COMPONENT_TYPES = new Set([
  ChoroplethFeatureLayer,
  ChoroplethGraticuleLayer,
  ChoroplethTooltipLayer,
]);

function resolveComponentType(type: unknown): unknown {
  if (
    typeof type === 'object' &&
    type !== null &&
    'type' in type &&
    (type as { type?: unknown }).type
  ) {
    return (type as { type: unknown }).type;
  }
  return type;
}

function getComponentDisplayName(type: unknown): string | null {
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName ?? fn.name ?? null;
  }
  if (typeof type === 'object' && type !== null) {
    const wrapped = type as {
      displayName?: string;
      type?: { displayName?: string; name?: string };
    };
    if (wrapped.displayName) {
      return wrapped.displayName;
    }
    const inner = wrapped.type;
    if (typeof inner === 'function') {
      const innerFn = inner as { displayName?: string; name?: string };
      return innerFn.displayName ?? innerFn.name ?? null;
    }
  }
  return null;
}

function isChoroplethSvgChild(type: unknown): boolean {
  if (SVG_COMPONENT_TYPES.has(type as never)) {
    return true;
  }
  const resolved = resolveComponentType(type);
  if (resolved !== type && SVG_COMPONENT_TYPES.has(resolved as never)) {
    return true;
  }
  const displayName = getComponentDisplayName(type);
  return displayName !== null && SVG_COMPONENT_NAMES.has(displayName);
}

// HTML elements that should render in overlay layer
const HTML_ELEMENTS = new Set(['div', 'span', 'button', 'p', 'a']);

// Separate children into SVG and overlay layers
function separateChildren(children: ReactNode): {
  svgChildren: React.ReactNode[];
  overlayChildren: React.ReactNode[];
} {
  const childArray = React.Children.toArray(children);
  const svgChildren: React.ReactNode[] = [];
  const overlayChildren: React.ReactNode[] = [];

  for (const child of childArray) {
    if (!React.isValidElement(child)) {
      svgChildren.push(child);
      continue;
    }

    if (isChoroplethSvgChild(child.type)) {
      svgChildren.push(child);
    } else if (typeof child.type === 'string') {
      if (HTML_ELEMENTS.has(child.type)) {
        overlayChildren.push(child);
      } else {
        svgChildren.push(child);
      }
    } else {
      overlayChildren.push(child);
    }
  }

  return { svgChildren, overlayChildren };
}

const DEFAULT_INITIAL_ZOOM: TransformMatrix = {
  scaleX: 1,
  scaleY: 1,
  translateX: 0,
  translateY: 0,
  skewX: 0,
  skewY: 0,
};

interface MercatorRenderProps {
  // biome-ignore lint/suspicious/noExplicitAny: visx geo projection bundle
  path: (geo: any) => string | null;
  projection: (coords: [number, number]) => [number, number] | null | undefined;
}

interface ChoroplethMercatorContentProps {
  mercator: MercatorRenderProps;
  data: FeatureCollection<Geometry, ChoroplethFeatureProperties>;
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  margin: Margin;
  animationDuration: number;
  enterTransition?: Transition;
  revealEpoch: number;
  isLoaded: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  svgChildren: React.ReactNode[];
  overlayChildren: React.ReactNode[];
  zoom?: ZoomInstance<SVGSVGElement>;
}

const ChoroplethSvg = memo(function ChoroplethSvg({
  height,
  width,
  svgChildren,
  zoom,
}: {
  height: number;
  width: number;
  svgChildren: React.ReactNode[];
  zoom?: ZoomInstance<SVGSVGElement>;
}) {
  const { setHoveredFeatureIndex, setTooltipData } = useChoroplethInteraction();

  const handleMouseLeave = useCallback(() => {
    setHoveredFeatureIndex(null);
    setTooltipData(null);
  }, [setHoveredFeatureIndex, setTooltipData]);

  return (
    <svg
      aria-hidden="true"
      height={height}
      onMouseLeave={handleMouseLeave}
      ref={zoom?.containerRef}
      style={{
        contain: 'layout style paint',
        cursor: zoom?.isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      width={width}
    >
      <g
        style={{
          transition: zoom?.isDragging ? 'none' : 'transform 0.18s ease-out',
        }}
        transform={zoom ? zoom.toString() : undefined}
      >
        {svgChildren}
      </g>
    </svg>
  );
});

const ChoroplethMercatorContent = memo(function ChoroplethMercatorContent({
  mercator,
  data,
  width,
  height,
  innerWidth,
  innerHeight,
  margin,
  animationDuration,
  enterTransition,
  revealEpoch,
  isLoaded,
  containerRef,
  svgChildren,
  overlayChildren,
  zoom,
}: ChoroplethMercatorContentProps) {
  const featurePaths = data.features.map(
    (feature) => mercator.path(feature) ?? null
  ) as (string | null)[];

  const pathGenerator = useCallback(
    (feature: ChoroplethFeature) => mercator.path(feature) ?? undefined,
    [mercator]
  );

  const rawPathGenerator = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: GeoJSON types are complex
    (geo: any) => mercator.path(geo),
    [mercator]
  );

  const projectPoint = useCallback(
    (coords: [number, number]): [number, number] | null => {
      const projected = mercator.projection(coords);
      if (!projected) {
        return null;
      }
      return projected as [number, number];
    },
    [mercator]
  );

  const stableValue = useMemo(
    () => ({
      features: data.features,
      featureCollection: data,
      featurePaths,
      pathGenerator,
      rawPathGenerator,
      projectPoint,
      width,
      height,
      innerWidth,
      innerHeight,
      margin,
      containerRef,
      isLoaded,
      animationDuration,
      enterTransition,
      revealEpoch,
    }),
    [
      animationDuration,
      containerRef,
      data,
      enterTransition,
      featurePaths,
      height,
      innerHeight,
      innerWidth,
      isLoaded,
      margin,
      pathGenerator,
      projectPoint,
      rawPathGenerator,
      revealEpoch,
      width,
    ]
  );

  return (
    <ChoroplethZoomContext.Provider value={{ zoom: zoom ?? null }}>
      <ChoroplethStableProvider value={stableValue}>
        <ChoroplethInteractionShell>
          <div className="relative h-full w-full" ref={containerRef}>
            <ChoroplethSvg
              height={height}
              svgChildren={svgChildren}
              width={width}
              zoom={zoom}
            />
            {overlayChildren}
          </div>
        </ChoroplethInteractionShell>
      </ChoroplethStableProvider>
    </ChoroplethZoomContext.Provider>
  );
});

function ChoroplethChartInner({
  data,
  width,
  height,
  margin,
  animationDuration,
  enterTransition,
  revealSignature = '',
  scale: scaleProp,
  center,
  translate: translateProp,
  zoomEnabled,
  zoomMin,
  zoomMax,
  initialZoom,
  children,
}: {
  data: FeatureCollection<Geometry, ChoroplethFeatureProperties>;
  width: number;
  height: number;
  margin: Margin;
  animationDuration: number;
  enterTransition?: Transition;
  revealSignature?: string;
  scale?: number;
  center: [number, number];
  translate?: [number, number];
  zoomEnabled: boolean;
  zoomMin: number;
  zoomMax: number;
  initialZoom: TransformMatrix;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [revealEpoch, setRevealEpoch] = useState(0);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const scale = scaleProp ?? (innerWidth / 630) * 100;

  const translate = translateProp ?? [
    innerWidth / 2 + margin.left,
    innerHeight / 2 + margin.top + 50,
  ];

  const { svgChildren, overlayChildren } = useMemo(
    () => separateChildren(children),
    [children]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: revealSignature
  useEffect(() => {
    setRevealEpoch((n) => n + 1);
    setIsLoaded(false);
    const timeout = setTimeout(() => {
      setIsLoaded(true);
    }, animationDuration);
    return () => clearTimeout(timeout);
  }, [animationDuration, revealSignature]);

  if (width < 10 || height < 10) {
    return null;
  }

  const mercatorContentProps = {
    animationDuration,
    containerRef,
    data,
    enterTransition,
    height,
    innerHeight,
    innerWidth,
    isLoaded,
    margin,
    overlayChildren,
    revealEpoch,
    svgChildren,
    width,
  };

  return (
    <Mercator
      center={center}
      data={data.features}
      scale={scale}
      translate={translate as [number, number]}
    >
      {(mercator) => {
        const content = (zoom?: ZoomInstance<SVGSVGElement>) => (
          <ChoroplethMercatorContent
            {...mercatorContentProps}
            mercator={mercator}
            zoom={zoom}
          />
        );

        if (zoomEnabled) {
          return (
            <Zoom<SVGSVGElement>
              height={height}
              initialTransformMatrix={initialZoom}
              scaleXMax={zoomMax}
              scaleXMin={zoomMin}
              scaleYMax={zoomMax}
              scaleYMin={zoomMin}
              wheelDelta={(event) => {
                const zoomScale = event.deltaY > 0 ? 0.95 : 1.05;
                return { scaleX: zoomScale, scaleY: zoomScale };
              }}
              width={width}
            >
              {(zoom) => content(zoom)}
            </Zoom>
          );
        }

        return content();
      }}
    </Mercator>
  );
}

export function ChoroplethChart({
  data,
  margin: marginProp,
  animationDuration = 800,
  enterTransition,
  revealSignature,
  aspectRatio = '16 / 9',
  scale,
  center = [0, 20],
  translate,
  zoomEnabled = false,
  zoomMin = 0.5,
  zoomMax = 4,
  initialZoom = DEFAULT_INITIAL_ZOOM,
  className = '',
  children,
}: ChoroplethChartProps) {
  const margin = { ...DEFAULT_MARGIN, ...marginProp };

  return (
    <div className={cn('relative w-full', className)} style={{ aspectRatio }}>
      <ParentSize debounceTime={10}>
        {({ width, height }) =>
          width > 0 && height > 0 ? (
            <ChoroplethChartInner
              animationDuration={animationDuration}
              center={center}
              data={data}
              enterTransition={enterTransition}
              height={height}
              initialZoom={initialZoom}
              margin={margin}
              revealSignature={revealSignature}
              scale={scale}
              translate={translate}
              width={width}
              zoomEnabled={zoomEnabled}
              zoomMax={zoomMax}
              zoomMin={zoomMin}
            >
              {children}
            </ChoroplethChartInner>
          ) : null
        }
      </ParentSize>
    </div>
  );
}

ChoroplethChart.displayName = 'ChoroplethChart';

export default ChoroplethChart;
