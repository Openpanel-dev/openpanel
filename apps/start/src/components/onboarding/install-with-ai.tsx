import type { Framework } from '@openpanel/sdk-info';
import { CopyIcon, SparklesIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  buildAiInstallPrompt,
  CURSOR_PROMPT_DEEPLINK,
} from './ai-install-prompt';
import { FrameworkPicker } from './framework-picker';
import type { SnippetContext } from './install-snippets';
import { Button, buttonVariants } from '@/components/ui/button';
import { clipboard } from '@/utils/clipboard';
import { cn } from '@/utils/cn';
import { op } from '@/utils/op';

const PROMPT_PREVIEW_LINES = 14;

interface Props {
  projectId: string;
  projectName: string;
  projectTypes: ('website' | 'app' | 'backend')[];
  context: SnippetContext;
}

export function InstallWithAi({
  projectId,
  projectName,
  projectTypes,
  context,
}: Props) {
  const [framework, setFramework] = useState<Framework | null>(null);
  const [expanded, setExpanded] = useState(false);
  const prompt = useMemo(
    () =>
      buildAiInstallPrompt({ projectName, projectTypes, framework, context }),
    [projectName, projectTypes, framework, context]
  );
  const lines = prompt.split('\n');
  const isLong = lines.length > PROMPT_PREVIEW_LINES;
  const shown =
    expanded || !isLong
      ? prompt
      : lines.slice(0, PROMPT_PREVIEW_LINES).join('\n');

  const copyPrompt = () => {
    op.track('onboarding_ai_prompt_copied', {
      projectId,
      framework: framework?.key ?? 'auto',
    });
    clipboard(prompt, 'Paste it into your coding assistant');
  };

  return (
    <div className="col gap-6">
      <div className="col gap-3">
        <div className="font-medium">Which framework? (optional)</div>
        <FrameworkPicker
          allowNone
          onChange={setFramework}
          projectTypes={projectTypes}
          value={framework}
        />
      </div>

      <div className="col gap-3">
        <div className="relative rounded-xl bg-def-200 dark:bg-def-300">
          <pre
            className={cn(
              'scrollbar-thin max-h-[26rem] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[13px] leading-relaxed',
              isLong && 'pb-12'
            )}
          >
            {shown}
            {isLong && !expanded && '\n…'}
          </pre>
          {isLong && (
            <button
              className="absolute right-3 bottom-3 rounded-md bg-background px-2 py-1 text-muted-foreground text-xs shadow-sm hover:text-foreground"
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              {expanded ? 'Show less' : 'Show full prompt'}
            </button>
          )}
        </div>
        <div className="row flex-wrap gap-2">
          <Button icon={CopyIcon} onClick={copyPrompt} size="xl">
            Copy prompt
          </Button>
          <a
            className={buttonVariants({ variant: 'outline', size: 'xl' })}
            href={`${CURSOR_PROMPT_DEEPLINK}${encodeURIComponent(prompt)}`}
            onClick={() =>
              op.track('onboarding_ai_prompt_opened_in_cursor', {
                projectId,
                framework: framework?.key ?? 'auto',
              })
            }
          >
            <SparklesIcon className="mr-2 size-4" />
            Open in Cursor
          </a>
        </div>
        <p className="text-muted-foreground text-sm">
          Works with Claude Code, Cursor, Copilot, Windsurf or any agent that
          can edit your code. It installs the SDK, adds your client ID and sends
          a first event. This page lights up when it arrives.
        </p>
      </div>
    </div>
  );
}
