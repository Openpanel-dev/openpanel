import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useChatState } from './chat-context';
import { type ChatModelOption, getModelLabel } from '@/agents/models';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Model (= agent) picker for the chat header. Each entry corresponds
 * to one Better Agent definition; selecting a model swaps to a
 * different agent name on the next render.
 */
export function ModelPicker() {
  const { agentName, setAgent, models } = useChatState();

  const grouped = models.reduce<Record<string, ChatModelOption[]>>((acc, m) => {
    (acc[m.group] ??= []).push(m);
    return acc;
  }, {});

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Select model"
          className="h-7 gap-1 px-2 text-muted-foreground text-xs"
          size="sm"
          title="Select model"
          variant="ghost"
        >
          <span className="max-w-[140px] truncate">
            {getModelLabel(agentName)}
          </span>
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {Object.entries(grouped).map(([group, items], idx) => (
          <div key={group}>
            {idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {group}
            </DropdownMenuLabel>
            {items.map((m) => (
              <DropdownMenuItem
                className="flex items-center justify-between gap-2"
                key={m.id}
                onSelect={() => setAgent(m.id)}
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
