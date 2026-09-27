// ClickHouse `FixedString(N)` pads short values with NUL bytes, so a row with
// no geo comes back as "\u0000\u0000" rather than an empty string. That text
// reached /export/events, the dashboard, the MCP tools and the charts
// (ISSUES.md, API nits).

export function stripFixedStringPadding(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the padding IS a control character
  return value.replace(/\u0000+$/, '');
}
