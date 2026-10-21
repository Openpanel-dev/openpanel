import { select } from 'd3-selection';
import 'd3-transition';
import type { D3ZoomEvent, ZoomBehavior, ZoomTransform } from 'd3-zoom';
import { zoom, zoomIdentity, zoomTransform } from 'd3-zoom';
import { LocateFixedIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  LABEL_MAX_COUNT,
  LABEL_MIN_SCREEN_AREA,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_ZOOM_ANIMATION_MS,
  MAP_ZOOM_BUTTON_FACTOR,
  MARKER_HIT_RADIUS,
  MARKER_PULSE_LIMIT,
  MARKER_VIEWPORT_MARGIN,
  NIGHT_REFRESH_MS,
} from './map-constants';
import type { MapGeometry, WorldShapes } from './map-geometry';
import {
  createMapGeometry,
  createNightPaths,
  loadWorldShapes,
} from './map-geometry';
import type { RealtimeMapPoint, RealtimeMapProps } from './map-types';
import type { MapPlace } from './map-utils';
import { getMarkerRadius, groupPointsByPlace } from './map-utils';
import {
  closeMapBadgeDetails,
  openMapBadgeDetails,
} from './realtime-map-badge-slice';
import { useTheme } from '@/hooks/use-theme';
import { useDispatch, useSelector } from '@/redux';
import { cn } from '@/utils/cn';

interface MapColors {
  land: string;
  border: string;
  grid: string;
  night: string;
  terminator: string;
}

interface PlacedMarker {
  /** The place plus which copy of the world it sits on. */
  key: string;
  place: MapPlace;
  x: number;
  y: number;
  radius: number;
  pulses: boolean;
}

/** Safari reports trackpad pinches as its own gesture events, not ctrl+wheel. */
interface SafariGestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

let worldShapesPromise: Promise<WorldShapes> | null = null;

function useWorldShapes() {
  const [shapes, setShapes] = useState<WorldShapes | null>(null);

  useEffect(() => {
    let cancelled = false;
    worldShapesPromise ??= loadWorldShapes();
    worldShapesPromise
      .then((loaded) => {
        if (!cancelled) {
          setShapes(loaded);
        }
      })
      .catch(() => {
        // Let the next mount try again instead of caching the failure.
        worldShapesPromise = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return shapes;
}

function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function useCurrentMinute() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), NIGHT_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  return now;
}

function readMapColors(element: HTMLElement, isDark: boolean): MapColors {
  const style = getComputedStyle(element);
  const read = (name: string) => style.getPropertyValue(name).trim();

  return {
    land: read('--def-300'),
    border: read('--def-100'),
    grid: read('--def-200'),
    night: isDark ? 'rgba(0, 0, 0, 0.32)' : 'rgba(15, 23, 42, 0.05)',
    terminator: read('--muted-foreground'),
  };
}

/** Canvas cannot use CSS variables, so the theme's values are read once the theme class is applied. */
function useMapColors(
  containerRef: React.RefObject<HTMLDivElement | null>,
  isDark: boolean
) {
  const [colors, setColors] = useState<MapColors | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (containerRef.current) {
        setColors(readMapColors(containerRef.current, isDark));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [containerRef, isDark]);

  return colors;
}

function drawMap({
  canvas,
  geometry,
  night,
  colors,
  transform,
}: {
  canvas: HTMLCanvasElement;
  geometry: MapGeometry;
  night: { area: Path2D; edge: Path2D } | null;
  colors: MapColors;
  transform: ZoomTransform;
}) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  const hairline = 1 / transform.k;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(
    pixelRatio * transform.k,
    0,
    0,
    pixelRatio * transform.k,
    pixelRatio * transform.x,
    pixelRatio * transform.y
  );

  for (const offset of getWorldCopyOffsets(geometry, transform, canvas)) {
    context.save();
    context.translate(offset, 0);
    drawWorld(context, geometry, night, colors, hairline);
    context.restore();
  }
}

function drawWorld(
  context: CanvasRenderingContext2D,
  geometry: MapGeometry,
  night: { area: Path2D; edge: Path2D } | null,
  colors: MapColors,
  hairline: number
) {
  context.globalAlpha = 0.6;
  context.strokeStyle = colors.grid;
  context.lineWidth = hairline;
  context.stroke(geometry.graticule);

  context.globalAlpha = 1;
  context.fillStyle = colors.land;
  context.fill(geometry.land);

  context.strokeStyle = colors.border;
  context.lineWidth = hairline;
  context.stroke(geometry.borders);

  if (night) {
    context.fillStyle = colors.night;
    context.fill(night.area);

    context.globalAlpha = 0.35;
    context.strokeStyle = colors.terminator;
    context.lineWidth = hairline;
    context.setLineDash([4 * hairline, 4 * hairline]);
    context.stroke(night.edge);
    context.setLineDash([]);
    context.globalAlpha = 1;
  }
}

/** Horizontal offsets of every copy of the world that overlaps the viewport. */
function getWorldCopyOffsets(
  geometry: MapGeometry,
  transform: ZoomTransform,
  viewport: { width: number }
): number[] {
  const pixelRatio = window.devicePixelRatio || 1;
  const viewportWidth = viewport.width / pixelRatio;
  const visibleLeft = transform.invertX(0);
  const visibleRight = transform.invertX(viewportWidth);
  const first = Math.floor(
    (visibleLeft - geometry.worldLeft) / geometry.worldWidth
  );
  const last = Math.floor(
    (visibleRight - geometry.worldLeft) / geometry.worldWidth
  );

  const offsets: number[] = [];
  for (let copy = first; copy <= last; copy++) {
    offsets.push(copy * geometry.worldWidth);
  }
  return offsets;
}

function placeMarkers(
  points: RealtimeMapPoint[],
  geometry: MapGeometry
): PlacedMarker[] {
  const placed: PlacedMarker[] = [];
  for (const place of groupPointsByPlace(points)) {
    const projected = geometry.projection([place.long, place.lat]);
    if (!projected) {
      continue;
    }
    placed.push({
      key: place.id,
      place,
      x: projected[0],
      y: projected[1],
      radius: getMarkerRadius(place.count),
      pulses: false,
    });
  }

  // Busiest places pulse and draw last, so they sit on top of quieter neighbours.
  placed.sort((a, b) => b.place.count - a.place.count);
  for (const marker of placed.slice(0, MARKER_PULSE_LIMIT)) {
    marker.pulses = true;
  }
  return placed.reverse();
}

export function RealtimeMap({ projectId, markers }: RealtimeMapProps) {
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const { width, height } = useElementSize(containerRef);
  const shapes = useWorldShapes();
  const now = useCurrentMinute();
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selectedId = useSelector(
    (state) => state.realtimeMapBadge.marker?.id ?? null
  );

  const hasSize = width > 0 && height > 0;
  const geometry = useMemo(
    () =>
      shapes && hasSize ? createMapGeometry(shapes, { width, height }) : null,
    [shapes, hasSize, width, height]
  );
  const night = useMemo(
    () => (geometry ? createNightPaths(geometry.projection, now) : null),
    [geometry, now]
  );
  const colors = useMapColors(containerRef, isDark);
  const placedMarkers = useMemo(
    () => (geometry ? placeMarkers(markers, geometry) : []),
    [geometry, markers]
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!(canvas && hasSize)) {
      return;
    }
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
  }, [hasSize, width, height]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!(canvas && geometry && colors)) {
      return;
    }
    drawMap({ canvas, geometry, night, colors, transform });
  }, [geometry, night, colors, transform]);

  useEffect(() => {
    const element = containerRef.current;
    if (!(element && geometry)) {
      return;
    }

    let gestureStartScale: number | null = null;
    const behavior = zoom<HTMLDivElement, unknown>()
      .scaleExtent([MAP_MIN_ZOOM, MAP_MAX_ZOOM])
      .extent([
        [0, 0],
        [width, height],
      ])
      .translateExtent(geometry.panBounds)
      .filter((event: MouseEvent | WheelEvent) => {
        const isWheel = event.type === 'wheel';
        if (isWheel && gestureStartScale !== null) {
          return false;
        }
        return (!event.ctrlKey || isWheel) && !event.button;
      })
      .on('zoom', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        setTransform(event.transform);
        if (event.sourceEvent) {
          setHoveredId(null);
          dispatch(closeMapBadgeDetails());
        }
      });

    const selection = select(element);
    selection.call(behavior).call(behavior.transform, zoomTransform(element));
    zoomRef.current = behavior;

    const pointFromGesture = (event: SafariGestureEvent): [number, number] => {
      const rect = element.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      gestureStartScale = zoomTransform(element).k;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      if (gestureStartScale === null) {
        return;
      }
      const gesture = event as SafariGestureEvent;
      behavior.scaleTo(
        selection,
        gestureStartScale * gesture.scale,
        pointFromGesture(gesture)
      );
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      gestureStartScale = null;
    };
    element.addEventListener('gesturestart', onGestureStart);
    element.addEventListener('gesturechange', onGestureChange);
    element.addEventListener('gestureend', onGestureEnd);

    return () => {
      selection.on('.zoom', null);
      element.removeEventListener('gesturestart', onGestureStart);
      element.removeEventListener('gesturechange', onGestureChange);
      element.removeEventListener('gestureend', onGestureEnd);
    };
  }, [geometry, width, height, dispatch]);

  const zoomBy = (factor: number) => {
    const element = containerRef.current;
    if (!(element && zoomRef.current)) {
      return;
    }
    select(element)
      .transition()
      .duration(MAP_ZOOM_ANIMATION_MS)
      .call(zoomRef.current.scaleBy, factor);
  };

  const resetZoom = () => {
    const element = containerRef.current;
    if (!(element && zoomRef.current)) {
      return;
    }
    select(element)
      .transition()
      .duration(MAP_ZOOM_ANIMATION_MS)
      .call(zoomRef.current.transform, zoomIdentity);
  };

  const isInView = (x: number, y: number) =>
    x >= -MARKER_VIEWPORT_MARGIN &&
    x <= width + MARKER_VIEWPORT_MARGIN &&
    y >= -MARKER_VIEWPORT_MARGIN &&
    y <= height + MARKER_VIEWPORT_MARGIN;

  const worldCopyOffsets = geometry
    ? getWorldCopyOffsets(geometry, transform, { width })
    : [];

  const visibleLabels = (geometry?.labels ?? [])
    .filter(
      (label) => label.area * transform.k * transform.k >= LABEL_MIN_SCREEN_AREA
    )
    .flatMap((label) =>
      worldCopyOffsets.map((offset) => ({
        ...label,
        key: `${label.name}@${offset}`,
        x: transform.applyX(label.x + offset),
        y: transform.applyY(label.y),
      }))
    )
    .filter((label) => isInView(label.x, label.y))
    .slice(0, LABEL_MAX_COUNT);

  const visibleMarkers = placedMarkers
    .flatMap((marker) =>
      worldCopyOffsets.map((offset) => ({
        ...marker,
        key: `${marker.place.id}@${offset}`,
        x: transform.applyX(marker.x + offset),
        y: transform.applyY(marker.y),
      }))
    )
    .filter((marker) => isInView(marker.x, marker.y));

  const hoveredMarker = visibleMarkers.find(
    (marker) => marker.key === hoveredId
  );

  const openDetails = (marker: PlacedMarker) => {
    dispatch(
      openMapBadgeDetails({
        projectId,
        marker: {
          id: marker.place.id,
          label: marker.place.label,
          count: marker.place.count,
          detailScope: 'coordinate',
          locations: marker.place.locations,
          screenPoint: { x: marker.x, y: marker.y },
        },
      })
    );
  };

  const isEmpty = shapes !== null && markers.length === 0;

  return (
    <div
      className="relative h-full w-full cursor-grab touch-none select-none overflow-hidden bg-def-100 active:cursor-grabbing"
      ref={containerRef}
    >
      <canvas
        className={cn(
          'absolute inset-0 h-full w-full transition-opacity duration-500',
          geometry ? 'opacity-100' : 'opacity-0'
        )}
        ref={canvasRef}
      />

      <svg
        aria-label="Visitors online now"
        className="pointer-events-none absolute inset-0 h-full w-full"
        height={height}
        role="img"
        width={width}
      >
        <g className="fill-muted-foreground/60 font-medium text-2xs uppercase tracking-widest">
          {visibleLabels.map((label) => (
            <text
              dominantBaseline="middle"
              key={label.key}
              textAnchor="middle"
              x={label.x}
              y={label.y}
            >
              {label.name}
            </text>
          ))}
        </g>

        <g className="pointer-events-auto">
          {visibleMarkers.map((marker) => (
            <VisitorMarker
              isActive={
                marker.key === hoveredId || marker.place.id === selectedId
              }
              key={marker.key}
              marker={marker}
              onHover={setHoveredId}
              onSelect={openDetails}
            />
          ))}
        </g>
      </svg>

      {hoveredMarker ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border bg-card px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: hoveredMarker.x,
            top: hoveredMarker.y - hoveredMarker.radius - 8,
          }}
        >
          <div className="font-medium">{hoveredMarker.place.label}</div>
          <div className="text-muted-foreground">
            {hoveredMarker.place.count.toLocaleString()} online
          </div>
        </div>
      ) : null}

      {isEmpty ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <div className="font-medium">No one is online right now</div>
          <div className="text-muted-foreground text-sm">
            Visitors appear here as they browse your site.
          </div>
        </div>
      ) : null}

      <div className="absolute right-4 bottom-4 flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <MapControlButton
          label="Zoom in"
          onClick={() => zoomBy(MAP_ZOOM_BUTTON_FACTOR)}
        >
          <PlusIcon className="size-4" />
        </MapControlButton>
        <MapControlButton
          label="Zoom out"
          onClick={() => zoomBy(1 / MAP_ZOOM_BUTTON_FACTOR)}
        >
          <MinusIcon className="size-4" />
        </MapControlButton>
        <MapControlButton label="Show the whole world" onClick={resetZoom}>
          <LocateFixedIcon className="size-4" />
        </MapControlButton>
      </div>
    </div>
  );
}

function MapControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-def-200 hover:text-foreground [&:not(:last-child)]:border-b"
      onClick={onClick}
      onMouseDown={(event) => event.stopPropagation()}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function VisitorMarker({
  marker,
  isActive,
  onHover,
  onSelect,
}: {
  marker: PlacedMarker;
  isActive: boolean;
  onHover: (id: string | null) => void;
  onSelect: (marker: PlacedMarker) => void;
}) {
  return (
    <g
      aria-label={`${marker.place.label}, ${marker.place.count} online`}
      className="cursor-pointer outline-none"
      onBlur={() => onHover(null)}
      onClick={() => onSelect(marker)}
      onFocus={() => onHover(marker.key)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(marker);
        }
      }}
      onPointerEnter={() => onHover(marker.key)}
      onPointerLeave={() => onHover(null)}
      role="button"
      tabIndex={0}
      transform={`translate(${marker.x},${marker.y})`}
    >
      {marker.pulses ? (
        <circle
          className="animate-map-marker-pulse fill-emerald-500"
          r={marker.radius}
        />
      ) : null}
      <circle
        fill="transparent"
        r={Math.max(MARKER_HIT_RADIUS, marker.radius)}
      />
      {isActive ? (
        <circle
          className="fill-none stroke-emerald-400"
          r={marker.radius + 4}
          strokeWidth={1.5}
        />
      ) : null}
      <circle
        className="fill-emerald-500 stroke-def-100"
        r={marker.radius}
        strokeWidth={1.5}
      />
    </g>
  );
}
