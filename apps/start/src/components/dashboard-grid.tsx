import type { IServiceReport } from '@openpanel/core';
import {
  GRID_COLUMNS,
  GRID_GAP,
  GRID_ROW_HEIGHT,
} from '@openpanel/core/modules/report/report.constants';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
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
const RESIZE_HANDLES: readonly ResizeHandleAxis[] = ['se', 'sw', 'ne', 'nw'];
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

  return (
    <div className="-m-4" ref={containerRef}>
      {mounted && (
        <GridLayout
          compactor={verticalCompactor}
          dragConfig={{ enabled: canEdit, handle: '.drag-handle' }}
          gridConfig={{
            cols: GRID_COLUMNS,
            rowHeight: GRID_ROW_HEIGHT,
            margin: [GRID_GAP, GRID_GAP],
          }}
          layout={gridLayout}
          onDragStop={onDragStop}
          onLayoutChange={canEdit ? onLayoutChange : undefined}
          onResizeStop={onResizeStop}
          resizeConfig={{ enabled: canEdit, handles: RESIZE_HANDLES }}
          width={width}
        >
          {children}
        </GridLayout>
      )}
    </div>
  );
}
