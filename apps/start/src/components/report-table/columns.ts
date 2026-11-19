import type { ReactNode } from 'react';

export type ReportCellFormat =
  | 'number'
  | 'percent'
  | 'currency'
  | 'minutes'
  | 'text';

/** How a numeric cell is shaded against the other values in its column. */
export type ReportCellDecoration = 'bar' | 'heat';

export interface ReportColumn<Row> {
  id: string;
  header: string;
  value: (row: Row) => number | string | null | undefined;
  /** Formats `value` for display and decides alignment. Default: `number`. */
  format?: ReportCellFormat;
  /** Replaces the cell's content; `formatted` is `value` run through the formatter. CSV still uses `value`. */
  render?: (row: Row, formatted: string) => ReactNode;
  width?: number;
  decorate?: ReportCellDecoration;
  /** Default: true. */
  sortable?: boolean;
}

/** The pinned first column: what a row is. */
export interface ReportRowIdentity<Row> {
  header: string;
  render: (row: Row) => ReactNode;
  /** Text the search box matches against. */
  searchText: (row: Row) => string;
  color?: (row: Row) => string;
  width?: number;
}

export const DEFAULT_COLUMN_WIDTH = 112;
export const DEFAULT_IDENTITY_WIDTH = 260;
