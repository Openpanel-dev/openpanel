import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type ChatModelOption, getModelLabel } from '@/agents/models';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useChatState } from './chat-context';

/**
 * Model (= agent) picker for the chat header. Each entry corresponds
 * to one Better Agent definition; selecting a model swaps to a
 * different agent name on the next render.
 */
export function ModelPicker() {
  const { agentName, setAgent, models } = useChatState();

  const grouped = models.reduce<Record<string, ChatModelOption[]>>(
    (acc, m) => {
      (acc[m.group] ??= []).push(m);
      return acc;
    },
    {},
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1 text-muted-foreground"
          aria-label="Select model"
          title="Select model"
        >
          <span className="truncate max-w-[140px]">
            {getModelLabel(agentName)}
          </span>
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {Object.entries(grouped).map(([group, items], idx) => (
          <div key={group}>
            {idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {group}
            </DropdownMenuLabel>
            {items.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onSelect={() => setAgent(m.id)}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate">{m.label}</span>
                {agentName === m.id && (
                  <CheckIcon className="size-3 shrink-0 text-foreground" />
                )}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
