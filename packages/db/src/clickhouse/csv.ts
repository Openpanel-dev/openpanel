// ClickHouse Map(String, String) format in CSV uses single quotes, not JSON double quotes
// Format: '{'key1':'value1','key2':'value2'}'
// Single quotes inside values must be escaped with backslash: \'
// We also need to escape newlines and control characters to prevent CSV parsing issues
const escapeMapValue = (str: string) => {
  return str
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/\n/g, '\\n') // Escape newlines
    .replace(/\r/g, '\\r') // Escape carriage returns
    .replace(/\t/g, '\\t') // Escape tabs
    .replace(/\0/g, '\\0'); // Escape null bytes
};

export const csvEscapeJson = (
  value: Record<string, unknown> | null | undefined,
): string => {
  if (value == null) return '';

  // Normalize to strings if your column is Map(String,String)
  const normalized: Record<string, string> = Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      String(k),
      v == null ? '' : String(v),
    ]),
  );

  // Empty object should return empty Map (without quotes, csvEscapeField will handle if needed)
  if (Object.keys(normalized).length === 0) return '{}';

  const pairs = Object.entries(normalized)
    .map(([k, v]) => `'${escapeMapValue(k)}':'${escapeMapValue(v)}'`)
    .join(',');

  // Return Map format without outer quotes - csvEscapeField will handle CSV escaping
  // This allows csvEscapeField to properly wrap/escape the entire field if it contains newlines/quotes
  return csvEscapeField(`{${pairs}}`);
};

// Escape a CSV field - wrap in double quotes if it contains commas, quotes, or newlines
// Double quotes inside must be doubled (""), per CSV standard
export const csvEscapeField = (value: string | number): string => {
  const str = String(value);

  // If field contains commas, quotes, or newlines, it must be quoted
  if (/[,"\n\r]/.test(str)) {
    // Escape double quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return str;
};
