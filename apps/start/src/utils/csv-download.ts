// A spreadsheet runs a cell that starts with one of these as a formula, even
// after leading whitespace, so exported text from tracked data could compute or
// fetch. A leading quote makes it literal text.
const SPREADSHEET_FORMULA_PREFIX = /^\s*[=+\-@\t\r]/;
// A signed number held as a string ("-5") is not a formula, and quoting it
// would stop the spreadsheet from summing it.
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const CSV_QUOTING_REQUIRED = /[",\n\r]/;

export function escapeCsvValue(
  value: string | number | null | undefined
): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  const isFormula =
    SPREADSHEET_FORMULA_PREFIX.test(value) && !PLAIN_NUMBER.test(value);
  const text = isFormula ? `'${value}` : value;
  return CSV_QUOTING_REQUIRED.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function buildCSV(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function cohortMembersToCSV(profileIds: string[]): string {
  if (!profileIds.length) {
    return '';
  }
  return buildCSV([['profile_id'], ...profileIds.map((id) => [id])]);
}
