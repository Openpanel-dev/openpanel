import type { ChatModelEntry } from '@openpanel/core/modules/assistant/assistant.constants';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PROVIDER_LABELS: Record<ChatModelEntry['provider'], string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const TIER_LABELS: Record<ChatModelEntry['tier'], string> = {
  fast: 'Fast',
  balanced: 'Balanced',
  deep: 'Deep',
};

export function ChatModelPicker({
  models,
  value,
  onChange,
}: {
  models: readonly ChatModelEntry[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const current = models.find((model) => model.id === value);
  const grouped: Record<string, ChatModelEntry[]> = {};
  for (const model of models) {
    const group = grouped[model.provider] ?? [];
    group.push(model);
    grouped[model.provider] = group;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Select model"
          className="h-8 gap-1 px-2 text-muted-foreground text-xs"
          size="sm"
          variant="ghost"
        >
          <span className="max-w-[140px] truncate">
            {current?.label ?? 'Model'}
          </span>
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {Object.entries(grouped).map(([provider, entries], index) => (
          <div key={provider}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-2xs text-muted-foreground uppercase tracking-wide">
              {PROVIDER_LABELS[provider as ChatModelEntry['provider']]}
            </DropdownMenuLabel>
            {entries.map((model) => (
              <DropdownMenuItem
                className="flex items-start justify-between gap-3"
                key={model.id}
                onSelect={() => onChange(model.id)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{model.label}</span>
                    <span className="rounded border px-1 text-3xs text-muted-foreground uppercase">
                      {TIER_LABELS[model.tier]}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {model.description}
                  </div>
                </div>
                {value === model.id && (
                  <CheckIcon className="mt-0.5 size-3.5 shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
