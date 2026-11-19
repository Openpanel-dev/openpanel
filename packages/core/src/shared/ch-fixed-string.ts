// ClickHouse `FixedString(N)` pads short values with NUL bytes, so a row with no
// geo comes back as "\u0000\u0000" instead of an empty string.

export function stripFixedStringPadding(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the padding IS a control character
  return value.replace(/\u0000+$/, '');
}
