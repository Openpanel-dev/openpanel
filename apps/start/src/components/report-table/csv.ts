import type { ReportColumn, ReportRowIdentity } from './columns';
import { escapeCsvValue } from '@/utils/csv-download';

/** Raw values, not the formatted ones, so the file can be summed in a spreadsheet. */
export function buildCsv<Row>(
  rows: Row[],
  identity: ReportRowIdentity<Row>,
  columns: ReportColumn<Row>[]
) {
  // A column without a header holds row actions, not data.
  const dataColumns = columns.filter((column) => column.header !== '');
  const header = [
    identity.header,
    ...dataColumns.map((column) => column.header),
  ];
  const lines = rows.map((row) => [
    identity.searchText(row),
    ...dataColumns.map((column) => column.value(row)),
  ]);
  return [header, ...lines]
    .map((line) => line.map(escapeCsvValue).join(','))
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
