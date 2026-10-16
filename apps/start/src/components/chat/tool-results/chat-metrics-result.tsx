import { isMetricsLike } from './output-types';
import { ResultCard, ToolStateGuard } from './shared';
import type { ToolResultProps } from './types';

/**
 * Renders simple metric grids for tools like `get_analytics_overview`
 * and `get_profile_metrics`. Tools return a flat object of named values;
 * we render up to 6 of them as labelled tiles.
 */
export function ChatMetricsResult({ part }: ToolResultProps) {
  return (
    <ToolStateGuard
      errorText={part.errorText}
      state={part.state}
      toolName={part.type.replace(/^tool-/, '')}
    >
      <ChatMetricsInner output={part.output} />
    </ToolStateGuard>
  );
}

function ChatMetricsInner({ output }: { output: unknown }) {
  if (!isMetricsLike(output)) {
    return null;
  }

  const entries = Object.entries(output).filter(
    (entry): entry is [string, number | string] =>
      typeof entry[1] === 'number' || typeof entry[1] === 'string'
  );
  if (entries.length === 0) {
    return null;
  }

  return (
    <ResultCard>
      <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-3">
        {entries.slice(0, 6).map(([key, value]) => (
          <div className="p-3" key={key}>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {humanize(key)}
            </div>
            <div className="mt-0.5 font-mono font-semibold text-sm tabular-nums">
              {formatValue(value)}
            </div>
          </div>
        ))}
      </div>
    </ResultCard>
  );
}

function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatValue(v: number | string): string {
  if (typeof v === 'number') {
    if (Number.isInteger(v)) {
      return v.toLocaleString();
    }
    return v.toFixed(2);
  }
  return v;
}
