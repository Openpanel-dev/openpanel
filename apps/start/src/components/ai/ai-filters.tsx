import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  CpuIcon,
  LayersIcon,
  ServerIcon,
  XIcon,
} from 'lucide-react';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { Button } from '@/components/ui/button';
import { AnimatedSearchInput } from '@/components/ui/data-table/data-table-toolbar';
import { ToolbarMultiSelect } from '@/components/ui/toolbar-select';
import { useAiFilters } from '@/hooks/use-ai-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

const NO_VALUES_TEXT = 'Nothing in this range';

export function AiFilters({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const { range, startDate, endDate } = useOverviewOptions();
  const { state, setState, activeCount, clear } = useAiFilters();
  const values = useQuery(
    trpc.ai.filterValues.queryOptions(
      { projectId, range, startDate, endDate },
      { staleTime: 60_000 }
    )
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToolbarMultiSelect
        emptyText={NO_VALUES_TEXT}
        icon={CpuIcon}
        label="Model"
        onChange={(models) =>
          setState({ models: models.length ? models : null })
        }
        options={values.data?.model ?? []}
        selected={state.models ?? []}
      />
      <ToolbarMultiSelect
        emptyText={NO_VALUES_TEXT}
        icon={ServerIcon}
        label="Provider"
        onChange={(providers) =>
          setState({ providers: providers.length ? providers : null })
        }
        options={values.data?.provider ?? []}
        selected={state.providers ?? []}
      />
      <ToolbarMultiSelect
        emptyText={NO_VALUES_TEXT}
        icon={LayersIcon}
        label="Feature"
        onChange={(names) => setState({ names: names.length ? names : null })}
        options={values.data?.name ?? []}
        selected={state.names ?? []}
      />
      <Button
        className={cn(state.errors && 'border-destructive/60 text-destructive')}
        icon={AlertTriangleIcon}
        onClick={() => setState({ errors: state.errors ? null : true })}
        variant="outline"
      >
        Errors only
      </Button>
      <AnimatedSearchInput
        onChange={(value) => setState({ q: value || null })}
        placeholder="Search prompts, trace id…"
        value={state.q ?? ''}
      />
      {state.profile && (
        <ScopePill
          label={`Profile ${state.profile}`}
          onClear={() => setState({ profile: null })}
        />
      )}
      {state.group && (
        <ScopePill
          label={`Group ${state.group}`}
          onClear={() => setState({ group: null })}
        />
      )}
      {state.conversation && (
        <ScopePill
          label={`Conversation ${state.conversation}`}
          onClear={() => setState({ conversation: null })}
        />
      )}
      {state.session && (
        <ScopePill
          label={`Session ${state.session}`}
          onClear={() => setState({ session: null })}
        />
      )}
      {activeCount > 0 && (
        <Button onClick={clear} variant="ghost">
          Clear
        </Button>
      )}
    </div>
  );
}

function ScopePill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="row h-9 items-center gap-1 rounded-md border bg-def-100 px-2 text-xs">
      <span className="max-w-48 truncate">{label}</span>
      <button
        aria-label={`Remove ${label}`}
        className="rounded p-0.5 hover:bg-def-200"
        onClick={onClear}
        type="button"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}
