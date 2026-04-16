import { DefaultToolResult } from './default-tool-result';
import { normalizeTableOutput, type TableRow } from './output-types';
import { ResultCard, ToolStateGuard } from './shared';
import type { ToolResultProps } from './types';

/**
 * Generic compact table for top-pages / top-referrers / breakdowns / etc.
 * The shape varies across tools (some return arrays, some `{ rows }`,
 * some `{ data }`); `normalizeTableOutput` is the single shape boundary.
 */
export function ChatTableResult(props: ToolResultProps) {
  const { part } = props;
  // When we can't shape this as a table (output isn't array-like OR the
  // array has 0 rows), fall through to the default "done chip" renderer
  // instead of showing a bare "No rows" card — which looks like an
  // error but usually just means the tool's output shape isn't what
  // we expected (or the user genuinely has no data yet). The chip is
  // tidy, has the real tool label, and lets the user expand to see
  // the raw output if they're curious.
  if (part.state === 'output-available') {
    const { rows } = normalizeTableOutput(part.output);
    if (rows.length === 0) {
      return <DefaultToolResult part={part} />;
    }
  }

  return (
    <ToolStateGuard
      state={part.state}
      errorText={part.errorText}
      toolName={part.type.replace(/^tool-/, '')}
    >
      <ChatTableInner output={part.output} />
    </ToolStateGuard>
  );
}

function ChatTableInner({ output }: { output: unknown }) {
  const { rows, total, truncated } = normalizeTableOutput(output);
  // Empty case is handled at the wrapper level (falls through to
  // DefaultToolResult) — this function only runs with rows present.
  if (rows.length === 0) return null;
  const { labelKey, valueKeys } = inferColumns(rows[0]!);

  return (
    <ResultCard>
      <table className="w-full text-sm">
        <thead className="bg-muted/30">
          <tr>
            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
              {humanize(labelKey)}
            </th>
            {valueKeys.map((k) => (
              <th
                key={k}
                className="text-right px-3 py-1.5 font-medium text-muted-foreground"
              >
                {humanize(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 15).map((row, idx) => (
            <tr
              key={typeof row.id === 'string' ? row.id : idx}
              className="border-t"
            >
              <td
                className="px-3 py-1.5 truncate max-w-[200px]"
                title={String(row[labelKey] ?? '')}
              >
                {String(row[labelKey] ?? '')}
              </td>
              {valueKeys.map((k) => (
                <td
                  key={k}
                  className="text-right px-3 py-1.5 font-mono tabular-nums"
                >
                  {formatValue(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 15 && (
        <div className="border-t px-3 py-1 text-[11px] text-muted-foreground">
          Showing 15 of {total ?? rows.length}
          {truncated && ' (truncated)'}
        </div>
      )}
    </ResultCard>
  );
}

// Preferred label columns, in order. The table renderer picks the
// first one present on the row over the file-order default — so a row
// with both `id` and `title` shows the title as the label, not the
// UUID. Add anything else that's a common "this is the human-readable
// name" field below.
const PREFERRED_LABEL_KEYS = [
  'title',
  'name',
  'label',
  'displayName',
  'display_name',
  'event_name',
  'eventName',
  'page',
  'path',
  'query',
  'referrer',
  'referrer_name',
  'country',
  'city',
  'device',
  'browser',
  'os',
  'summary',
] as const;

// Keys we never want as the label column even if they happen to be the
// first string field. UUIDs / opaque ids are unhelpful in the table —
// the model can still reference them in prose.
const UNINTERESTING_LABEL_KEYS = new Set([
  'id',
  'projectId',
  'organizationId',
  'userId',
  'profileId',
  'sessionId',
  'reportId',
  'groupId',
  'dashboardId',
  'insightId',
  'threadId',
]);

function inferColumns(first: TableRow): {
  labelKey: string;
  valueKeys: string[];
} {
  const numericKeys: string[] = [];
  const stringKeys: string[] = [];
  for (const [key, value] of Object.entries(first)) {
    if (typeof value === 'number') {
      numericKeys.push(key);
    } else if (typeof value === 'string') {
      stringKeys.push(key);
    }
  }

  // 1. Prefer one of our known descriptive keys.
  const preferred = PREFERRED_LABEL_KEYS.find((k) => k in first);
  // 2. Otherwise the first string key that isn't an opaque id.
  const firstNonId = stringKeys.find((k) => !UNINTERESTING_LABEL_KEYS.has(k));
  // 3. Last resort: the first string (or any) key.
  const labelKey =
    preferred ?? firstNonId ?? stringKeys[0] ?? Object.keys(first)[0]!;

  const valueKeys = numericKeys.slice(0, 3);
  return { labelKey, valueKeys };
}

function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return v.toLocaleString();
    return v.toFixed(2);
  }
  return v != null ? String(v) : '—';
}
