import { useQuery } from '@tanstack/react-query';
import { AlertTriangleIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { Button } from '@/components/ui/button';
import { AnimatedSearchInput } from '@/components/ui/data-table/data-table-toolbar';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAiFilters } from '@/hooks/use-ai-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

interface ValuePickerProps {
  label: string;
  values: { value: string; count: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function ValuePicker({ label, values, selected, onChange }: ValuePickerProps) {
  const active = selected.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn(active && 'border-foreground/40')}
          size="sm"
          variant="outline"
        >
          {label}
          {active && (
            <span className="rounded bg-def-200 px-1 font-mono text-2xs">
              {selected.length}
            </span>
          )}
          <ChevronDownIcon className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {values.length === 0 && (
          <div className="px-2 py-1.5 text-muted-foreground text-sm">
            Nothing in this range
          </div>
        )}
        {values.map((item) => (
          <DropdownMenuCheckboxItem
            checked={selected.includes(item.value)}
            key={item.value}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...selected, item.value]
                  : selected.filter((value) => value !== item.value)
              )
            }
            onSelect={(event) => event.preventDefault()}
          >
            <span className="min-w-0 flex-1 truncate">{item.value}</span>
            <span className="ml-2 font-mono text-2xs text-muted-foreground">
              {item.count}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
      <ValuePicker
        label="Model"
        onChange={(models) =>
          setState({ models: models.length ? models : null })
        }
        selected={state.models ?? []}
        values={values.data?.model ?? []}
      />
      <ValuePicker
        label="Provider"
        onChange={(providers) =>
          setState({ providers: providers.length ? providers : null })
        }
        selected={state.providers ?? []}
        values={values.data?.provider ?? []}
      />
      <ValuePicker
        label="Feature"
        onChange={(names) => setState({ names: names.length ? names : null })}
        selected={state.names ?? []}
        values={values.data?.name ?? []}
      />
      <Button
        className={cn(state.errors && 'border-destructive/60 text-destructive')}
        icon={AlertTriangleIcon}
        onClick={() => setState({ errors: state.errors ? null : true })}
        size="sm"
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
        <Button onClick={clear} size="sm" variant="ghost">
          Clear
        </Button>
      )}
    </div>
  );
}

function ScopePill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="row h-8 items-center gap-1 rounded-md border bg-def-100 px-2 text-xs">
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
