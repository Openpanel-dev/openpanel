import { useState } from 'react';
import { cn } from '@/utils/cn';

const COLLAPSED_ROWS = 8;
const MAX_COLUMNS = 6;
const numberFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

function cell(value: unknown): string {
  // An empty dimension (no UTM, no referrer) reads better named than blank.
  if (value === null || value === undefined || value === '') {
    return '(none)';
  }
  if (typeof value === 'number') {
    return numberFormat.format(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function humanize(key: string): string {
  return key.replace(/_/g, ' ');
}

/** Rows from a tool, as a compact table with a "show all" toggle. */
export function TableCard({
  title,
  rows,
  total,
  preferredColumns,
  onRowClick,
}: {
  title: string;
  rows: Record<string, unknown>[];
  total?: number;
  /** Shown first when present in the rows; the rest fill up to the column cap. */
  preferredColumns?: string[];
  onRowClick?: (row: Record<string, unknown>) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const available = Object.keys(rows[0] ?? {}).filter(
    (key) => !key.startsWith('__') && key !== 'url'
  );
  const preferred = (preferredColumns ?? []).filter((key) =>
    available.includes(key)
  );
  const columns = [
    ...preferred,
    ...available.filter((key) => !preferred.includes(key)),
  ].slice(0, Math.max(MAX_COLUMNS, preferred.length));
  const visible = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);
  const hidden = rows.length - visible.length;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3 text-muted-foreground text-sm">
        {title}: no rows.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">
          {total && total > rows.length
            ? `${rows.length} of ${total}`
            : `${rows.length} rows`}
        </span>
      </div>
      <div className="overflow-x-auto border-t">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground text-xs">
              {columns.map((column) => (
                <th
                  className="whitespace-nowrap px-3 py-1.5 font-medium"
                  key={column}
                >
                  {humanize(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr
                className={cn(
                  'border-t',
                  onRowClick && 'cursor-pointer hover:bg-muted/50'
                )}
                key={`${index}-${cell(row[columns[0] ?? ''])}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter') {
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => (
                  <td
                    className={cn(
                      'max-w-[260px] truncate px-3 py-1.5',
                      typeof row[column] === 'number' &&
                        'text-right tabular-nums'
                    )}
                    key={column}
                    title={cell(row[column])}
                  >
                    {cell(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <button
          className="w-full border-t px-4 py-1.5 text-muted-foreground text-xs hover:bg-muted/50"
          onClick={() => setShowAll(true)}
          type="button"
        >
          Show {hidden} more
        </button>
      )}
    </div>
  );
}
