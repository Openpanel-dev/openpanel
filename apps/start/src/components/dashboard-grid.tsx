import type { IServiceReport } from '@openpanel/core';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  GridLayout,
  type GridLayoutProps,
  type Layout,
  type LayoutItem,
  useContainerWidth,
  verticalCompactor,
} from 'react-grid-layout';

export type { Layout, LayoutItem } from 'react-grid-layout';

export const GRID_COLUMNS = 12;
export const GRID_ROW_HEIGHT = 100;
export const GRID_GAP = 16;
export const TILE_MIN_SIZE = { minW: 3, minH: 3 } as const;
const TILE_DEFAULT_SIZE = { w: 6, h: 4 } as const;
// Narrower than this and tiles stack in one column with no drag, since a
// drag would hijack scrolling on a phone.
const SINGLE_COLUMN_MAX_WIDTH = 640;

type DashboardReport = NonNullable<IServiceReport>;

function toLayout(reports: DashboardReport[]): Layout {
  return reports.map((report, index) => ({
    i: report.id,
    x: report.layout?.x ?? (index % 2) * TILE_DEFAULT_SIZE.w,
    y: report.layout?.y ?? Math.floor(index / 2) * TILE_DEFAULT_SIZE.h,
    w: report.layout?.w ?? TILE_DEFAULT_SIZE.w,
    h: report.layout?.h ?? TILE_DEFAULT_SIZE.h,
    ...TILE_MIN_SIZE,
  }));
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
          resizeConfig={{ enabled: canEdit }}
          width={width}
        >
          {children}
        </GridLayout>
      )}
    </div>
  );
}
