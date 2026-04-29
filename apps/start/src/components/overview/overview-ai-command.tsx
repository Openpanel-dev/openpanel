import { useMutation } from '@tanstack/react-query';
import { Loader2Icon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { chatToolHandlers } from '../chat/tool-handlers';
import { Input } from '../ui/input';
import { useOverviewOptions } from './useOverviewOptions';
import { useAppParams } from '@/hooks/use-app-params';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

/**
 * Inline AI command bar. Calls the `overview.runFilterCommand`
 * mutation, then dispatches the returned URL-mutator actions through
 * the same handlers the chat panel uses (`chatToolHandlers`).
 *
 * `className` controls layout — caller passes the width / responsive
 * visibility it wants (e.g. compact `hidden w-[280px] md:block` in a
 * page header, `w-full` inside a filter sheet).
 */
export function OverviewAICommand({ className }: { className?: string }) {
  const { projectId, organizationId } = useAppParams();
  const { range, startDate, endDate, interval } = useOverviewOptions();
  const [eventNames] = useEventQueryNamesFilter();
  const [eventFilters] = useEventQueryFilters();
  const trpc = useTRPC();

  const [value, setValue] = useState('');

  const mutation = useMutation(
    trpc.overview.runFilterCommand.mutationOptions({
      onSuccess: async (result) => {
        // Dispatch each non-null group through the existing client
        // handlers — they own URL serialization + popstate plumbing.
        // Strip null inner fields from applyFilters: the schema uses
        // nullable for OpenAI strict-mode compatibility, but the chat
        // handler expects undefined to mean "leave this alone".
        let applied = 0;
        if (result.applyFilters) {
          const af = result.applyFilters;
          await chatToolHandlers.apply_filters({
            ...(af.range !== null ? { range: af.range } : {}),
            ...(af.startDate !== null ? { startDate: af.startDate } : {}),
            ...(af.endDate !== null ? { endDate: af.endDate } : {}),
            ...(af.interval !== null ? { interval: af.interval } : {}),
          });
          applied += 1;
        }
        if (result.setPropertyFilters) {
          await chatToolHandlers.set_property_filters(
            result.setPropertyFilters
          );
          applied += 1;
        }
        if (result.setEventNamesFilter) {
          await chatToolHandlers.set_event_names_filter(
            result.setEventNamesFilter
          );
          applied += 1;
        }

        if (applied === 0) {
          toast(
            result.summary ||
              "Couldn't translate that into a filter — try rephrasing."
          );
        } else if (result.summary) {
          toast(result.summary);
        }

        setValue('');
      },
      onError: handleError,
    })
  );

  function submit() {
    const query = value.trim();
    if (!query || mutation.isPending) {
      return;
    }
    mutation.mutate({
      projectId,
      query,
      pageContext: {
        page: 'overview',
        route: { projectId, organizationId },
        filters: {
          range,
          startDate: startDate ?? undefined,
          endDate: endDate ?? undefined,
          interval: interval ?? undefined,
          ...(eventNames.length > 0 ? { eventNames } : {}),
          ...(eventFilters.length > 0 ? { eventFilters } : {}),
        },
      },
    });
  }

  const pending = mutation.isPending;

  return (
    <div className={cn('relative', className)}>
      <SparklesIcon
        className={cn(
          'pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground',
          pending && 'opacity-0'
        )}
      />
      {pending && (
        <Loader2Icon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      <Input
        aria-label="AI filter command"
        className="pl-8"
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        placeholder='Try: "last 7 days, mobile only"'
        value={value}
      />
    </div>
  );
}
