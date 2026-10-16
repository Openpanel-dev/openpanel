import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { ResultCard, ToolDoneBadge, ToolStateGuard } from './shared';
import { getToolPhrase } from './tool-labels';
import type { ToolResultProps } from './types';

/**
 * Auto-fallback for tools that don't have a custom UI in the registry.
 * Shows a friendly "Done — <Tool>" chip with click-to-expand JSON.
 */
export function DefaultToolResult({ part }: ToolResultProps) {
  const toolName = part.type.replace(/^tool-/, '');

  return (
    <ToolStateGuard
      errorText={part.errorText}
      state={part.state}
      toolName={toolName}
    >
      <DefaultInner output={part.output} toolName={toolName} />
    </ToolStateGuard>
  );
}

function DefaultInner({
  toolName,
  output,
}: {
  toolName: string;
  output: unknown;
}) {
  const [expanded, setExpanded] = useState(false);

  if (output == null) {
    return (
      <ResultCard title={getToolPhrase(toolName, 'done')}>
        <div className="px-3 py-2 text-muted-foreground text-sm">
          No result.
        </div>
      </ResultCard>
    );
  }

  if (typeof output === 'string') {
    return (
      <ResultCard title={getToolPhrase(toolName, 'done')}>
        <div className="whitespace-pre-wrap px-3 py-2 text-sm">{output}</div>
      </ResultCard>
    );
  }

  // Most "data" tools: render the friendly Done chip with optional
  // JSON drill-down. Tools we want as full cards have their own
  // entry in the registry.
  return (
    <ToolDoneBadge toolName={toolName}>
      <button
        className="-mx-2.5 -my-2 flex w-[calc(100%+1.25rem)] items-center gap-1 px-2.5 py-1.5 text-left text-muted-foreground text-sm hover:bg-muted/40"
        onClick={() => setExpanded((e) => !e)}
        type="button"
      >
        <ChevronRightIcon
          className={`size-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="truncate">
          {Array.isArray(output)
            ? `${output.length} item${output.length === 1 ? '' : 's'}`
            : 'View raw output'}
        </span>
      </button>
      {expanded && (
        <pre className="-mx-2.5 mt-2 -mb-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-all border-t bg-muted/20 px-2.5 py-2 font-mono text-[11px]">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </ToolDoneBadge>
  );
}
