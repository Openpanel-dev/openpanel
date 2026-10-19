import { useNavigate } from '@tanstack/react-router';
import { getToolName, isToolUIPart } from 'ai';
import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { ChatMarkdown } from './chat-markdown';
import { ApprovalCard, ApprovalDecided } from './parts/approval-card';
import { BillingCard, type BillingOutput } from './parts/billing-card';
import { ChartCard } from './parts/chart-card';
import { DiagnosisCard, type DiagnosisOutput } from './parts/diagnosis-card';
import {
  ClientCreatedCard,
  DialogCard,
  DocsCard,
  NavigateCard,
  PlanChangeCard,
  SearchCard,
} from './parts/result-cards';
import { TableCard } from './parts/table-card';
import {
  isRichToolPart,
  ToolActivityGroup,
  type ToolPart,
} from './parts/tool-activity-group';
import { ToolActivity, ToolDone, ToolError } from './parts/tool-card';
import { toolPhrase } from './tool-labels';
import {
  type AssistantUIMessage,
  type AssistantUIMessagePart,
  isChartOutput,
  isErrorOutput,
  isRowsOutput,
} from './types';
import { useAppParams } from '@/hooks/use-app-params';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';

export function ChatMessage({
  message,
  streaming,
  onApproval,
}: {
  message: AssistantUIMessage;
  /** True only for the assistant message being generated right now. */
  streaming: boolean;
  onApproval: (approvalId: string, approved: boolean) => void;
}) {
  if (message.role === 'user') {
    const text = message.parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('');
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground">
          {text}
        </div>
      </div>
    );
  }

  const lastIndex = message.parts.length - 1;
  return (
    <div className="flex flex-col gap-3">
      {groupParts(message.parts).map((group, index) =>
        Array.isArray(group) ? (
          <ToolActivityGroup
            key={group[0]?.toolCallId ?? index}
            parts={group}
          />
        ) : (
          <MessagePart
            key={partKey(group.part, group.index)}
            onApproval={onApproval}
            part={group.part}
            streaming={streaming && group.index === lastIndex}
          />
        )
      )}
    </div>
  );
}

type PartGroup = ToolPart[] | { part: AssistantUIMessagePart; index: number };

/** Plain tool calls that follow each other become one activity line. */
function groupParts(parts: AssistantUIMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  for (const [index, part] of parts.entries()) {
    const isPlainTool = isToolUIPart(part) && !isRichToolPart(part);
    const last = groups.at(-1);
    if (isPlainTool && Array.isArray(last)) {
      last.push(part as ToolPart);
    } else if (isPlainTool) {
      groups.push([part as ToolPart]);
    } else if (part.type === 'step-start') {
      // Step boundaries carry nothing to show and must not split a group.
    } else {
      groups.push({ part, index });
    }
  }
  return groups;
}

function partKey(part: AssistantUIMessagePart, index: number): string {
  if (isToolUIPart(part)) {
    return part.toolCallId;
  }
  return `${part.type}-${index}`;
}

function MessagePart({
  part,
  streaming,
  onApproval,
}: {
  part: AssistantUIMessagePart;
  streaming: boolean;
  onApproval: (approvalId: string, approved: boolean) => void;
}) {
  if (part.type === 'text') {
    return <ChatMarkdown text={part.text} />;
  }
  if (part.type === 'reasoning') {
    return <Reasoning streaming={streaming} text={part.text} />;
  }
  if (isToolUIPart(part)) {
    return <ToolPartView onApproval={onApproval} part={part} />;
  }
  return null;
}

function ToolPartView({
  part,
  onApproval,
}: {
  part: ToolPart;
  onApproval: (approvalId: string, approved: boolean) => void;
}) {
  const toolName = getToolName(part);
  const input = part.input as Record<string, unknown> | undefined;

  switch (part.state) {
    case 'input-streaming':
    case 'input-available':
      return <ToolActivity toolName={toolName} />;
    case 'approval-requested': {
      if (part.approval.isAutomatic) {
        return <ToolActivity toolName={toolName} />;
      }
      return (
        <ApprovalCard
          input={input}
          onRespond={(approved) => onApproval(part.approval.id, approved)}
          toolName={toolName}
        />
      );
    }
    case 'approval-responded':
      return part.approval.approved ? (
        <ToolActivity toolName={toolName} />
      ) : (
        <ApprovalDecided approved={false} input={input} toolName={toolName} />
      );
    case 'output-denied':
      return (
        <ApprovalDecided approved={false} input={input} toolName={toolName} />
      );
    case 'output-error':
      return <ToolError message={part.errorText} toolName={toolName} />;
    case 'output-available':
      return (
        <ToolResult input={input} output={part.output} toolName={toolName} />
      );
    default:
      return null;
  }
}

function ToolResult({
  toolName,
  input,
  output,
}: {
  toolName: string;
  input: Record<string, unknown> | undefined;
  output: unknown;
}) {
  if (isErrorOutput(output)) {
    return <ToolError message={output.error} toolName={toolName} />;
  }
  if (isChartOutput(output)) {
    return <ChartCard output={output} />;
  }
  if (toolName === 'navigate' && input) {
    return (
      <NavigateCard
        input={input as Parameters<typeof NavigateCard>[0]['input']}
        output={output as { opened?: string }}
      />
    );
  }
  if (toolName === 'open_dialog' && input) {
    return (
      <DialogCard input={input as Parameters<typeof DialogCard>[0]['input']} />
    );
  }
  if (toolName === 'search_docs') {
    const results = (output as { results?: { title: string; url: string }[] })
      .results;
    return results ? <DocsCard results={results} /> : null;
  }
  if (toolName === 'search') {
    const hit = output as Parameters<typeof SearchCard>[0];
    return (
      <SearchCard
        eventNames={hit.eventNames ?? []}
        profiles={hit.profiles ?? []}
        session={hit.session ?? null}
      />
    );
  }
  if (toolName === 'change_plan') {
    return <PlanChangeCard output={output as { checkoutUrl?: string }} />;
  }
  if (toolName === 'get_billing') {
    return <BillingCard output={output as BillingOutput} />;
  }
  if (toolName === 'diagnose_tracking') {
    return <DiagnosisCard output={output as DiagnosisOutput} />;
  }
  if (toolName === 'create_client') {
    return (
      <ClientCreatedCard client={output as { id?: string; secret?: string }} />
    );
  }
  if (isRowsOutput(output) && output.rows.length === 0) {
    return <ToolDone output={output} toolName={toolName} />;
  }
  if (isRowsOutput(output)) {
    const title =
      typeof input?.dimension === 'string'
        ? `Top ${String(input.dimension).replace(/_/g, ' ')}`
        : toolPhrase(toolName, 'done');
    return (
      <RowsTable
        rows={output.rows}
        title={title}
        toolName={toolName}
        total={output.total}
      />
    );
  }
  if (
    Array.isArray(output) &&
    output.every((row) => typeof row === 'object' && row)
  ) {
    return (
      <TableCard
        rows={output as Record<string, unknown>[]}
        title={toolPhrase(toolName, 'done')}
      />
    );
  }
  return <ToolDone output={output} toolName={toolName} />;
}

/** Columns worth seeing first for raw rows, and what a click on a row opens. */
const PREFERRED_COLUMNS: Record<string, string[]> = {
  query_events: [
    'created_at',
    'name',
    'path',
    'country',
    'device',
    'profile_id',
  ],
  query_sessions: [
    'created_at',
    'entry_path',
    'referrer_name',
    'country',
    'device',
    'duration',
    'screen_view_count',
  ],
};

function RowsTable({
  rows,
  title,
  toolName,
  total,
}: {
  rows: Record<string, unknown>[];
  title: string;
  toolName: string;
  total?: number;
}) {
  const navigate = useNavigate();
  const { organizationId, projectId } = useAppParams();
  let onRowClick: ((row: Record<string, unknown>) => void) | undefined;
  if (toolName === 'query_events') {
    onRowClick = (row) => {
      if (typeof row.id === 'string' && typeof row.created_at === 'string') {
        pushModal('EventDetails', {
          id: row.id,
          createdAt: new Date(row.created_at),
          projectId,
        });
      }
    };
  }
  if (toolName === 'query_sessions') {
    onRowClick = (row) => {
      if (typeof row.id === 'string') {
        navigate({
          to: '/$organizationId/$projectId/sessions/$sessionId',
          params: { organizationId, projectId, sessionId: row.id },
        });
      }
    };
  }
  return (
    <TableCard
      onRowClick={onRowClick}
      preferredColumns={PREFERRED_COLUMNS[toolName]}
      rows={rows}
      title={title}
      total={total}
    />
  );
}

/** The model's reasoning: a shimmer while it streams, a disclosure afterwards. */
function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  const latestLine =
    trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .pop() ?? '';

  if (streaming) {
    return (
      <div>
        <div className="op-shimmer font-medium text-sm">Thinking…</div>
        {latestLine && (
          <div className="mt-1 line-clamp-1 text-muted-foreground/80 text-sm italic">
            {latestLine}
          </div>
        )}
      </div>
    );
  }
  if (!trimmed) {
    return null;
  }
  return (
    <div>
      <button
        className="flex items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <ChevronRightIcon
          className={cn('size-3 transition-transform', open && 'rotate-90')}
        />
        Thought
      </button>
      {open && (
        <ChatMarkdown
          className="mt-2 text-muted-foreground text-sm"
          text={trimmed}
        />
      )}
    </div>
  );
}
