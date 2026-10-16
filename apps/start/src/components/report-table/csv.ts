import type { ReportColumn, ReportRowIdentity } from './columns';

function escapeCell(cell: string) {
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Raw values, not the formatted ones, so the file can be summed in a spreadsheet. */
export function buildCsv<Row>(
  rows: Row[],
  identity: ReportRowIdentity<Row>,
  columns: ReportColumn<Row>[]
) {
  const header = [identity.header, ...columns.map((column) => column.header)];
  const lines = rows.map((row) => [
    identity.searchText(row),
    ...columns.map((column) => String(column.value(row) ?? '')),
  ]);
  return [header, ...lines]
    .map((line) => line.map(escapeCell).join(','))
    .join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
