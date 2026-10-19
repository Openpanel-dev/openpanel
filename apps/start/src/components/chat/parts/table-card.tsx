import { useState } from 'react';
import { cn } from '@/utils/cn';

const COLLAPSED_ROWS = 8;
const MAX_COLUMNS = 6;
const numberFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

function cell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
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
}: {
  title: string;
  rows: Record<string, unknown>[];
  total?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const columns = Object.keys(rows[0] ?? {})
    .filter((key) => !key.startsWith('__') && key !== 'url')
    .slice(0, MAX_COLUMNS);
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
                className="border-t"
                key={`${index}-${cell(row[columns[0] ?? ''])}`}
              >
                {columns.map((column) => (
                  <td
                    className={cn(
                      'max-w-[260px] truncate px-3 py-1.5',
                      typeof row[column] === 'number' &&
                        'text-right font-mono tabular-nums'
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
