import { select } from 'd3-selection';
import 'd3-transition';
import type { D3ZoomEvent, ZoomBehavior, ZoomTransform } from 'd3-zoom';
import { zoom, zoomIdentity, zoomTransform } from 'd3-zoom';
import { LocateFixedIcon, MinusIcon, PlusIcon } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LABEL_MAX_COUNT,
  LABEL_MIN_SCREEN_AREA,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_ZOOM_ANIMATION_MS,
  MAP_ZOOM_BUTTON_FACTOR,
  MARKER_HIT_RADIUS,
  MARKER_PULSE_LIMIT,
  NIGHT_MAX_ALPHA_DARK,
  NIGHT_MAX_ALPHA_LIGHT,
  NIGHT_REFRESH_MS,
  RASTER_SETTLE_MS,
  RESIZE_SETTLE_MS,
} from './map-constants';
import type { CountryLabel, MapGeometry, WorldShapes } from './map-geometry';
import {
  createMapGeometry,
  createNightRings,
  loadWorldShapes,
} from './map-geometry';
import type { MarkerStyle } from './map-markers-canvas';
import { drawMarkers } from './map-markers-canvas';
import type { WorldStyle } from './map-raster';
import { WorldRaster } from './map-raster';
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

interface PlacedMarker {
  id: string;
  place: MapPlace;
  /** World coordinates at zoom 1. */
  x: number;
  y: number;
  radius: number;
  pulses: boolean;
}

interface ScreenPoint {
  x: number;
  y: number;
}

interface HoveredMarker extends ScreenPoint {
  marker: PlacedMarker;
}

interface MapStyle {
  world: WorldStyle;
  markers: MarkerStyle;
}

/** Safari reports trackpad pinches as its own gesture events, not ctrl+wheel. */
interface SafariGestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

const FALLBACK_MARKER_FILL = '#10b981';
const FALLBACK_MARKER_RING = '#34d399';

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

/** The first size lands at once; later ones wait for the resize to pause. */
function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isFirst = true;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const next = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      if (isFirst) {
        isFirst = false;
        setSize(next);
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => setSize(next), RESIZE_SETTLE_MS);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer) {
        clearTimeout(timer);
      }
    };
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

function readMapStyle(element: HTMLElement, isDark: boolean): MapStyle {
  const style = getComputedStyle(element);
  const read = (name: string, fallback = '') =>
    style.getPropertyValue(name).trim() || fallback;

  return {
    world: {
      ocean: read('--def-100'),
      land: read('--def-300'),
      border: read('--def-100'),
      night: isDark ? '#000' : '#0f172a',
      nightAlpha: isDark ? NIGHT_MAX_ALPHA_DARK : NIGHT_MAX_ALPHA_LIGHT,
    },
    markers: {
      fill: read('--color-emerald-500', FALLBACK_MARKER_FILL),
      stroke: read('--def-100'),
      ring: read('--color-emerald-400', FALLBACK_MARKER_RING),
    },
  };
}

/** Canvas cannot use CSS variables, so the theme's values are read once the theme class is applied. */
function useMapStyle(
  containerRef: React.RefObject<HTMLDivElement | null>,
  isDark: boolean
) {
  const [style, setStyle] = useState<MapStyle | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (containerRef.current) {
        setStyle(readMapStyle(containerRef.current, isDark));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [containerRef, isDark]);

  return style;
}

function isSameMarker(a: PlacedMarker, b: PlacedMarker) {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.radius === b.radius &&
    a.pulses === b.pulses &&
    a.place.count === b.place.count &&
    a.place.label === b.place.label
  );
}

/**
 * Projects the places, keeping the previous object for any place that did
 * not change, so hit targets of unchanged places skip re-rendering on the
 * refetch that arrives every second under load.
 */
function placeMarkers(
  points: RealtimeMapPoint[],
  geometry: MapGeometry,
  previous: PlacedMarker[]
): PlacedMarker[] {
  const placed: PlacedMarker[] = [];
  for (const place of groupPointsByPlace(points)) {
    const projected = geometry.projection([place.long, place.lat]);
    if (!projected) {
      continue;
    }
    placed.push({
      id: place.id,
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
  placed.reverse();

  const previousById = new Map(previous.map((marker) => [marker.id, marker]));
  let reused = 0;
  const next = placed.map((marker) => {
    const known = previousById.get(marker.id);
    if (known && isSameMarker(known, marker)) {
      reused++;
      return known;
    }
    return marker;
  });
  const isUnchanged = reused === next.length && next.length === previous.length;
  return isUnchanged ? previous : next;
}

/**
 * The world copy under the viewport's centre and one on each side. Three
 * always cover the viewport, and the set only changes when the centre crosses
 * into the next world, so copies are not mounted and unmounted on every nudge.
 */
function getWorldCopyOffsets(
  geometry: MapGeometry,
  transform: ZoomTransform,
  viewportWidth: number
): number[] {
  const centre = Math.floor(
    (transform.invertX(viewportWidth / 2) - geometry.worldLeft) /
      geometry.worldWidth
  );
  return [centre - 1, centre, centre + 1].map(
    (copy) => copy * geometry.worldWidth
  );
}

function sameOffsets(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function pointInContainer(
  event: { clientX: number; clientY: number },
  container: HTMLElement
): ScreenPoint {
  const bounds = container.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

/**
 * The dot under a screen point, if any. A few hundred distance checks per
 * mouse move cost nothing, where a DOM hit target per dot cost a style
 * recalculation per zoom frame.
 */
function findMarkerAt(
  point: ScreenPoint,
  markers: PlacedMarker[],
  transform: ZoomTransform,
  copyOffsets: number[]
): HoveredMarker | null {
  let best: HoveredMarker | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const offset of copyOffsets) {
    for (const marker of markers) {
      const x = transform.applyX(marker.x + offset);
      const y = transform.applyY(marker.y);
      const reach = Math.max(MARKER_HIT_RADIUS, marker.radius);
      const distance = Math.hypot(x - point.x, y - point.y);
      if (distance <= reach && distance < bestDistance) {
        best = { marker, x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
}

function sizeCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
}

export function RealtimeMap({ projectId, markers }: RealtimeMapProps) {
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const worldCanvasRef = useRef<HTMLCanvasElement>(null);
  const markerCanvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const rasterRef = useRef<WorldRaster | null>(null);
  const copyOffsetsRef = useRef<number[]>([0]);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMovingRef = useRef(false);
  const { width, height } = useElementSize(containerRef);
  const shapes = useWorldShapes();
  const now = useCurrentMinute();
  const style = useMapStyle(containerRef, isDark);
  const [copyOffsets, setCopyOffsets] = useState<number[]>([0]);
  const [settledZoom, setSettledZoom] = useState(1);
  const [hovered, setHovered] = useState<HoveredMarker | null>(null);
  const selectedId = useSelector(
    (state) => state.realtimeMapBadge.marker?.id ?? null
  );
  const activeId = hovered?.marker.id ?? selectedId;

  const hasSize = width > 0 && height > 0;
  const geometry = useMemo(
    () =>
      shapes && hasSize ? createMapGeometry(shapes, { width, height }) : null,
    [shapes, hasSize, width, height]
  );
  const night = useMemo(
    () => (geometry ? createNightRings(geometry.projection, now) : null),
    [geometry, now]
  );
  const previousMarkersRef = useRef<PlacedMarker[]>([]);
  const placedMarkers = useMemo(() => {
    const placed = geometry
      ? placeMarkers(markers, geometry, previousMarkersRef.current)
      : [];
    previousMarkersRef.current = placed;
    return placed;
  }, [geometry, markers]);
  const visibleLabels = useMemo(
    () =>
      (geometry?.labels ?? [])
        .filter(
          (label) =>
            label.area * settledZoom * settledZoom >= LABEL_MIN_SCREEN_AREA
        )
        .slice(0, LABEL_MAX_COUNT),
    [geometry, settledZoom]
  );

  const viewport = useCallback(
    () => ({ width, height, pixelRatio: window.devicePixelRatio || 1 }),
    [width, height]
  );

  const paintWorld = useCallback(() => {
    const context = worldCanvasRef.current?.getContext('2d', { alpha: false });
    const raster = rasterRef.current;
    if (!(context && raster && hasSize)) {
      return;
    }
    raster.draw(context, transformRef.current, viewport());
  }, [hasSize, viewport]);

  const paintMarkers = useCallback(
    (now = performance.now()) => {
      const context = markerCanvasRef.current?.getContext('2d');
      if (!(context && style && hasSize)) {
        return;
      }
      drawMarkers({
        context,
        markers: placedMarkers,
        transform: transformRef.current,
        viewport: viewport(),
        copyOffsets: copyOffsetsRef.current,
        activeId,
        style: style.markers,
        now,
      });
    },
    [style, hasSize, placedMarkers, activeId, viewport]
  );
  const paintMarkersRef = useRef(paintMarkers);
  paintMarkersRef.current = paintMarkers;

  // The pan and zoom go straight to the DOM and canvases every frame; React
  // only hears about them once the gesture settles.
  const applyTransform = useCallback(
    (transform: ZoomTransform) => {
      const previous = transformRef.current;
      transformRef.current = transform;
      const world = worldRef.current;
      if (world) {
        world.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`;
        if (transform.k !== previous.k) {
          world.style.setProperty('--map-inverse-k', String(1 / transform.k));
        }
      }
      if (geometry) {
        const offsets = getWorldCopyOffsets(geometry, transform, width);
        if (!sameOffsets(copyOffsetsRef.current, offsets)) {
          copyOffsetsRef.current = offsets;
          setCopyOffsets(offsets);
        }
      }
      paintWorld();
      paintMarkers();
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        setSettledZoom(transform.k);
      }, RASTER_SETTLE_MS);
    },
    [geometry, width, paintWorld, paintMarkers]
  );

  useLayoutEffect(() => {
    if (!(worldCanvasRef.current && markerCanvasRef.current && hasSize)) {
      return;
    }
    sizeCanvas(worldCanvasRef.current, width, height);
    sizeCanvas(markerCanvasRef.current, width, height);
  }, [hasSize, width, height]);

  useLayoutEffect(() => {
    if (!(geometry && night && style)) {
      return;
    }
    if (rasterRef.current) {
      rasterRef.current.update(geometry, night, style.world);
    } else {
      rasterRef.current = new WorldRaster(geometry, night, style.world, () =>
        paintWorld()
      );
    }
    paintWorld();
  }, [geometry, night, style, paintWorld]);

  useLayoutEffect(() => {
    paintMarkers();
  }, [paintMarkers]);

  // The pulse rings animate on the canvas, one frame at a time, and pause
  // while the tab is hidden.
  const hasPulses = placedMarkers.some((marker) => marker.pulses);
  useEffect(() => {
    if (!hasPulses) {
      return;
    }
    let frame = 0;
    const tick = (now: number) => {
      paintMarkersRef.current(now);
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState === 'visible') {
        frame = requestAnimationFrame(tick);
      }
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', start);
    };
  }, [hasPulses]);

  useEffect(
    () => () => {
      rasterRef.current?.dispose();
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
    },
    []
  );

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
      .on('start', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        isMovingRef.current = true;
        if (event.sourceEvent) {
          setHovered(null);
          dispatch(closeMapBadgeDetails());
        }
      })
      .on('zoom', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        applyTransform(event.transform);
      })
      .on('end', () => {
        isMovingRef.current = false;
      });

    const selection = select(element);
    selection.call(behavior);
    applyTransform(zoomTransform(element));
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
  }, [geometry, width, height, dispatch, applyTransform]);

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

  const markerScreenPoint = useCallback((marker: PlacedMarker): ScreenPoint => {
    const transform = transformRef.current;
    const copy = copyOffsetsRef.current[1] ?? 0;
    return {
      x: transform.applyX(marker.x + copy),
      y: transform.applyY(marker.y),
    };
  }, []);

  const hoverAt = useCallback(
    (point: ScreenPoint | null) => {
      const next = point
        ? findMarkerAt(
            point,
            placedMarkers,
            transformRef.current,
            copyOffsetsRef.current
          )
        : null;
      setHovered((previous) =>
        previous?.marker === next?.marker ? previous : next
      );
    },
    [placedMarkers]
  );

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || isMovingRef.current) {
      return;
    }
    hoverAt(pointInContainer(event, container));
  };

  const selectMarker = useCallback(
    (marker: PlacedMarker, screenPoint: ScreenPoint) => {
      dispatch(
        openMapBadgeDetails({
          projectId,
          marker: {
            id: marker.place.id,
            label: marker.place.label,
            count: marker.place.count,
            detailScope: 'coordinate',
            locations: marker.place.locations,
            screenPoint,
          },
        })
      );
    },
    [dispatch, projectId]
  );

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const hit = findMarkerAt(
      pointInContainer(event, container),
      placedMarkers,
      transformRef.current,
      copyOffsetsRef.current
    );
    if (hit) {
      selectMarker(hit.marker, hit);
    }
  };

  const focusMarker = useCallback(
    (marker: PlacedMarker | null) => {
      setHovered(marker ? { marker, ...markerScreenPoint(marker) } : null);
    },
    [markerScreenPoint]
  );

  const activateMarker = useCallback(
    (marker: PlacedMarker) => selectMarker(marker, markerScreenPoint(marker)),
    [selectMarker, markerScreenPoint]
  );

  return (
    <div
      className="relative h-full w-full touch-none select-none overflow-hidden bg-def-100"
      ref={containerRef}
    >
      <canvas
        className={cn(
          'absolute inset-0 h-full w-full transition-opacity duration-500',
          geometry ? 'opacity-100' : 'opacity-0'
        )}
        ref={worldCanvasRef}
      />
      <canvas
        className="pointer-events-none absolute inset-0 h-full w-full"
        ref={markerCanvasRef}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 origin-top-left will-change-transform"
        ref={worldRef}
      >
        {copyOffsets.map((offset) => (
          <WorldLabels key={offset} labels={visibleLabels} offset={offset} />
        ))}
      </div>

      <MarkerList
        markers={placedMarkers}
        onActivate={activateMarker}
        onFocus={focusMarker}
      />

      {/* Takes the pointer on its own so a cursor change restyles one element, not the whole map. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the pointer is read for hit testing; keyboard users get the button list above */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same as above */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users activate dots through the button list above */}
      <div
        className={cn(
          'absolute inset-0 active:cursor-grabbing',
          hovered ? 'cursor-pointer' : 'cursor-grab'
        )}
        onClick={handleClick}
        onPointerLeave={() => hoverAt(null)}
        onPointerMove={handlePointerMove}
      />

      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border bg-card px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: hovered.x,
            top: hovered.y - hovered.marker.radius - 8,
          }}
        >
          <div className="font-medium">{hovered.marker.place.label}</div>
          <div className="text-muted-foreground">
            {hovered.marker.place.count.toLocaleString()} online
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

/** Keeps its screen size at every zoom: the world scales up, this scales back down. */
const COUNTER_SCALE = 'translate(-50%, -50%) scale(var(--map-inverse-k))';
const WorldLabels = memo(function WorldLabels({
  offset,
  labels,
}: {
  offset: number;
  labels: CountryLabel[];
}) {
  return (
    <div
      className="absolute top-0 left-0"
      style={{ transform: `translateX(${offset}px)` }}
    >
      {labels.map((label) => (
        <div
          className="absolute whitespace-nowrap font-medium text-2xs text-muted-foreground/60 uppercase tracking-widest"
          key={label.name}
          style={{ left: label.x, top: label.y, transform: COUNTER_SCALE }}
        >
          {label.name}
        </div>
      ))}
    </div>
  );
});

/** Keyboard access to the dots: a visually hidden button per place that never moves. */
const MarkerList = memo(function MarkerList({
  markers,
  onFocus,
  onActivate,
}: {
  markers: PlacedMarker[];
  onFocus: (marker: PlacedMarker | null) => void;
  onActivate: (marker: PlacedMarker) => void;
}) {
  return (
    <ul aria-label="Visitors online now" className="sr-only">
      {markers.map((marker) => (
        <MarkerListItem
          key={marker.id}
          marker={marker}
          onActivate={onActivate}
          onFocus={onFocus}
        />
      ))}
    </ul>
  );
});

const MarkerListItem = memo(function MarkerListItem({
  marker,
  onFocus,
  onActivate,
}: {
  marker: PlacedMarker;
  onFocus: (marker: PlacedMarker | null) => void;
  onActivate: (marker: PlacedMarker) => void;
}) {
  return (
    <li>
      <button
        onBlur={() => onFocus(null)}
        onClick={() => onActivate(marker)}
        onFocus={() => onFocus(marker)}
        type="button"
      >
        {marker.place.label}, {marker.place.count} online
      </button>
    </li>
  );
});
