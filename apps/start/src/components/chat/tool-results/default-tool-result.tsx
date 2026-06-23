import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResultCard,
  ToolDoneBadge,
  ToolStateGuard,
  useToolPhraseTranslator,
} from './shared';
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
      state={part.state}
      errorText={part.errorText}
      toolName={toolName}
    >
      <DefaultInner toolName={toolName} output={part.output} />
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
  const { t } = useTranslation();
  const translateToolPhrase = useToolPhraseTranslator();
  const [expanded, setExpanded] = useState(false);

  if (output == null) {
    return (
      <ResultCard title={translateToolPhrase(getToolPhrase(toolName, 'done'))}>
        <div className="px-3 py-2 text-sm text-muted-foreground">
          {t('chat.tool_result_empty')}
        </div>
      </ResultCard>
    );
  }

  if (typeof output === 'string') {
    return (
      <ResultCard title={translateToolPhrase(getToolPhrase(toolName, 'done'))}>
        <div className="px-3 py-2 text-sm whitespace-pre-wrap">{output}</div>
      </ResultCard>
    );
  }

  // Most "data" tools: render the friendly Done chip with optional
  // JSON drill-down. Tools we want as full cards have their own
  // entry in the registry.
  return (
    <ToolDoneBadge toolName={toolName}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 -mx-2.5 -my-2 px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/40 w-[calc(100%+1.25rem)] text-left"
      >
        <ChevronRightIcon
          className={`size-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="truncate">
          {Array.isArray(output)
            ? t('chat.tool_result_item_count', { count: output.length })
            : t('chat.tool_result_view_raw_output')}
        </span>
      </button>
      {expanded && (
        <pre className="mt-2 -mx-2.5 -mb-2 px-2.5 py-2 border-t text-[11px] font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto bg-muted/20">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </ToolDoneBadge>
  );
}
