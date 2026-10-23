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
import { trackFunnel } from '@/utils/funnel-tracking';

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
  const prompt = useMemo(
    () =>
      buildAiInstallPrompt({ projectName, projectTypes, framework, context }),
    [projectName, projectTypes, framework, context]
  );

  const copyPrompt = () => {
    trackFunnel('onboarding_ai_prompt_copied', {
      projectId,
      framework: framework?.key ?? 'auto',
      promptLength: prompt.length,
    });
    clipboard(prompt, 'Paste it into your coding assistant');
  };

  return (
    <div className="col gap-6">
      <div className="col gap-3">
        <div className="font-medium">Which framework? (optional)</div>
        <FrameworkPicker
          allowNone
          onChange={(next) => {
            trackFunnel('onboarding_ai_framework_selected', {
              projectId,
              framework: next?.key ?? 'auto',
            });
            setFramework(next);
          }}
          onToggleAll={(open) =>
            trackFunnel('onboarding_frameworks_show_all_toggled', {
              projectId,
              method: 'ai',
              open,
            })
          }
          projectTypes={projectTypes}
          value={framework}
        />
      </div>

      <div className="col gap-3">
        <pre className="scrollbar-thin max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-def-200 p-4 font-mono text-xs leading-relaxed dark:bg-def-300">
          {prompt}
        </pre>
        <div className="row flex-wrap gap-2">
          <Button icon={CopyIcon} onClick={copyPrompt} size="xl">
            Copy prompt
          </Button>
          <a
            className={buttonVariants({ variant: 'outline', size: 'xl' })}
            href={`${CURSOR_PROMPT_DEEPLINK}${encodeURIComponent(prompt)}`}
            onClick={() =>
              trackFunnel('onboarding_ai_prompt_opened_in_cursor', {
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
