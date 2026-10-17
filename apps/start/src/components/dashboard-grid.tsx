import type { IServiceReport } from '@openpanel/core';
import {
  GRID_COLUMNS,
  GRID_GAP,
  GRID_ROW_HEIGHT,
} from '@openpanel/core/modules/report/report.constants';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type EventCallback,
  GridLayout,
  type GridLayoutProps,
  type Layout,
  type LayoutItem,
  type ResizeHandleAxis,
  useContainerWidth,
  verticalCompactor,
} from 'react-grid-layout';

export {
  GRID_COLUMNS,
  GRID_GAP,
  GRID_ROW_HEIGHT,
} from '@openpanel/core/modules/report/report.constants';
export type { Layout, LayoutItem } from 'react-grid-layout';

export const TILE_MIN_SIZE = { minW: 6, minH: 6 } as const;
const RESIZE_HANDLES: readonly ResizeHandleAxis[] = [
  'n',
  'e',
  's',
  'w',
  'ne',
  'nw',
  'se',
  'sw',
];
// The whole header drags the tile; its controls keep their clicks.
const DRAG_HANDLE = '.tile-header';
const DRAG_CANCEL =
  'button, a, input, textarea, select, [role="menu"], [role="menuitem"]';
// Within this distance of the viewport's top or bottom a gesture scrolls the
// page, up to the max speed (px per frame) at the very edge.
const AUTO_SCROLL_EDGE = 80;
const AUTO_SCROLL_MAX_SPEED = 18;
const TILE_DEFAULT_SIZE = { w: 12, h: 8 } as const;
// Narrower than this and tiles stack in one column with no drag, since a
// drag would hijack scrolling on a phone.
const SINGLE_COLUMN_MAX_WIDTH = 640;

export type DashboardReport = NonNullable<IServiceReport>;
/** What placing a report on the grid needs; the dashboards list has reports in a lighter shape than the editor. */
export interface LayoutSource {
  id: string;
  layout?:
    | (Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'> & { gridColumns?: number })
    | null;
}

export function toLayout(reports: LayoutSource[]): Layout {
  return reports.map((report, index) => {
    const saved = report.layout;
    if (!saved) {
      return {
        i: report.id,
        x: (index % 2) * TILE_DEFAULT_SIZE.w,
        y: Math.floor(index / 2) * TILE_DEFAULT_SIZE.h,
        ...TILE_DEFAULT_SIZE,
        ...TILE_MIN_SIZE,
      };
    }
    // A layout not yet moved by the grid migration is drawn at the same size
    // on the finer grid; its next save stores it in the new units.
    const scale = GRID_COLUMNS / (saved.gridColumns ?? GRID_COLUMNS);
    return {
      i: report.id,
      x: saved.x * scale,
      y: saved.y * scale,
      w: saved.w * scale,
      h: saved.h * scale,
      ...TILE_MIN_SIZE,
    };
  });
}

function toSingleColumn(layout: Layout): Layout {
  const ordered = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  let nextY = 0;
  return ordered.map((item) => {
    const stacked = { ...item, x: 0, y: nextY, w: GRID_COLUMNS };
    nextY += item.h;
    return stacked;
  });
}

type TilePosition = Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>;

export function isSameTilePosition(a: TilePosition, b: TilePosition) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

// The grid owns the layout while the user drags; saved positions only seed it.
export function useDashboardLayout(reports: DashboardReport[]) {
  const savedLayout = useMemo(() => toLayout(reports), [reports]);
  const [layout, setLayout] = useState(savedLayout);

  useEffect(() => {
    setLayout(savedLayout);
  }, [savedLayout]);

  return [layout, setLayout] as const;
}

function hasScrollingAncestor(element: HTMLElement | null) {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    const scrolls = overflowY === 'auto' || overflowY === 'scroll';
    if (scrolls && node.scrollHeight > node.clientHeight) {
      return true;
    }
  }
  return false;
}

function edgeScrollSpeed(pointerY: number) {
  const fromBottom = window.innerHeight - pointerY;
  if (pointerY < AUTO_SCROLL_EDGE) {
    return -AUTO_SCROLL_MAX_SPEED * (1 - pointerY / AUTO_SCROLL_EDGE);
  }
  if (fromBottom < AUTO_SCROLL_EDGE) {
    return AUTO_SCROLL_MAX_SPEED * (1 - fromBottom / AUTO_SCROLL_EDGE);
  }
  return 0;
}

/**
 * Scrolls the page while the pointer rests near the viewport edge; returns a
 * stop function. react-grid-layout already edge-scrolls an overflowing
 * ancestor, but not the page itself, which is what scrolls a dashboard.
 */
function startEdgeScroll(container: HTMLElement | null) {
  if (hasScrollingAncestor(container)) {
    return () => undefined;
  }
  let pointer: { x: number; y: number } | null = null;
  let frame = 0;
  const trackPointer = (event: MouseEvent) => {
    if (event.isTrusted) {
      pointer = { x: event.clientX, y: event.clientY };
    }
  };
  const tick = () => {
    const speed = pointer ? edgeScrollSpeed(pointer.y) : 0;
    if (pointer && speed !== 0) {
      window.scrollBy(0, speed);
      // The grid only moves the tile on pointer moves, so replay the resting
      // pointer to keep the tile under it while the page scrolls.
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientX: pointer.x,
          clientY: pointer.y,
        })
      );
    }
    frame = requestAnimationFrame(tick);
  };
  document.addEventListener('mousemove', trackPointer);
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('mousemove', trackPointer);
  };
}

// A drag reports the tile itself, a resize reports the handle inside it.
function tileOf(element: HTMLElement | null) {
  return element?.closest<HTMLElement>('.react-grid-item') ?? null;
}

function tileBodyOf(tile: HTMLElement | null) {
  return tile?.querySelector<HTMLElement>('[data-tile-body]') ?? null;
}

/**
 * What a drag or resize does besides moving the tile: scroll at the viewport
 * edge, show the size the tile will snap to, and hold the chart at its
 * starting size so it renders once on release instead of every frame.
 */
function useGestureEffects(
  containerRef: React.RefObject<HTMLDivElement | null>,
  {
    onDragStop,
    onResizeStop,
  }: Pick<GridLayoutProps, 'onDragStop' | 'onResizeStop'>
) {
  const stopEdgeScroll = useRef<(() => void) | null>(null);
  // Set once a gesture has passed the drag threshold, so a plain click on a
  // tile's title is never treated as the start of one.
  const begin = useCallback(() => {
    stopEdgeScroll.current?.();
    stopEdgeScroll.current = startEdgeScroll(containerRef.current);
    containerRef.current?.setAttribute('data-gesture', '');
  }, [containerRef]);
  const end = useCallback(() => {
    stopEdgeScroll.current?.();
    stopEdgeScroll.current = null;
    containerRef.current?.removeAttribute('data-gesture');
  }, [containerRef]);
  useEffect(() => end, [end]);

  const handleDragStart = useCallback<EventCallback>(() => begin(), [begin]);
  const handleDragStop = useCallback<EventCallback>(
    (...args) => {
      end();
      onDragStop?.(...args);
    },
    [end, onDragStop]
  );
  const handleResizeStart = useCallback<EventCallback>(
    (_layout, _oldItem, _newItem, _placeholder, _event, element) => {
      begin();
      const body = tileBodyOf(tileOf(element));
      if (body) {
        const { width, height } = body.getBoundingClientRect();
        body.style.flex = 'none';
        body.style.width = `${width}px`;
        body.style.height = `${height}px`;
      }
    },
    [begin]
  );
  const handleResize = useCallback<EventCallback>(
    (_layout, _oldItem, newItem, _placeholder, _event, element) => {
      const tile = tileOf(element);
      if (tile && newItem) {
        tile.dataset.tileSize = `${newItem.w} × ${newItem.h}`;
      }
    },
    []
  );
  const handleResizeStop = useCallback<EventCallback>(
    (...args) => {
      end();
      const tile = tileOf(args[5]);
      const body = tileBodyOf(tile);
      if (body) {
        body.style.flex = '';
        body.style.width = '';
        body.style.height = '';
      }
      if (tile) {
        delete tile.dataset.tileSize;
      }
      onResizeStop?.(...args);
    },
    [end, onResizeStop]
  );

  return {
    onDragStart: handleDragStart,
    onDragStop: handleDragStop,
    onResizeStart: handleResizeStart,
    onResize: handleResize,
    onResizeStop: handleResizeStop,
  };
}

export function DashboardGrid({
  layout,
  isEditable = false,
  onLayoutChange,
  onDragStop,
  onResizeStop,
  children,
}: {
  layout: Layout;
  isEditable?: boolean;
  children: ReactNode;
} & Pick<GridLayoutProps, 'onLayoutChange' | 'onDragStop' | 'onResizeStop'>) {
  const { width, containerRef, mounted } = useContainerWidth();
  const isSingleColumn = width < SINGLE_COLUMN_MAX_WIDTH;
  const canEdit = isEditable && !isSingleColumn;
  const gridLayout = useMemo(
    () => (isSingleColumn ? toSingleColumn(layout) : layout),
    [isSingleColumn, layout]
  );
  const gesture = useGestureEffects(containerRef, {
    onDragStop,
    onResizeStop,
  });

  return (
    <div className="-m-4" ref={containerRef}>
      {mounted && (
        <GridLayout
          compactor={verticalCompactor}
          dragConfig={{
            enabled: canEdit,
            handle: DRAG_HANDLE,
            cancel: DRAG_CANCEL,
          }}
          gridConfig={{
            cols: GRID_COLUMNS,
            rowHeight: GRID_ROW_HEIGHT,
            margin: [GRID_GAP, GRID_GAP],
          }}
          layout={gridLayout}
          onDragStart={gesture.onDragStart}
          onDragStop={gesture.onDragStop}
          onLayoutChange={canEdit ? onLayoutChange : undefined}
          onResize={gesture.onResize}
          onResizeStart={gesture.onResizeStart}
          onResizeStop={gesture.onResizeStop}
          resizeConfig={{ enabled: canEdit, handles: RESIZE_HANDLES }}
          width={width}
        >
          {children}
        </GridLayout>
      )}
    </div>
  );
}
