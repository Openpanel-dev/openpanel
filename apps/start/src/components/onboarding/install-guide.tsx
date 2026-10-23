import { useState } from 'react';
import { InstallManual } from './install-manual';
import type { SnippetContext } from './install-snippets';
import { InstallWithAi } from './install-with-ai';
import { cn } from '@/utils/cn';
import { op } from '@/utils/op';

type InstallMethod = 'ai' | 'manual';
type ProjectType = 'website' | 'app' | 'backend';

const METHODS: { key: InstallMethod; label: string; hint: string }[] = [
  {
    key: 'ai',
    label: 'Install with AI',
    hint: 'Paste one prompt into your coding assistant',
  },
  {
    key: 'manual',
    label: 'Manual setup',
    hint: 'Copy the snippet for your framework',
  },
];

interface Props {
  projectId: string;
  projectName: string;
  projectTypes: ProjectType[];
  context: SnippetContext;
  defaultMethod?: InstallMethod;
}

/** The two ways to add the SDK, as a segmented switch. */
export function InstallGuide({
  projectId,
  projectName,
  projectTypes,
  context,
  defaultMethod = 'ai',
}: Props) {
  const [method, setMethod] = useState<InstallMethod>(defaultMethod);

  const select = (next: InstallMethod) => {
    op.track('onboarding_install_method_selected', { projectId, method: next });
    setMethod(next);
  };

  return (
    <div className="col gap-6">
      <div
        aria-label="Installation method"
        className="grid grid-cols-2 gap-1 rounded-xl bg-def-200 p-1 dark:bg-def-300"
        role="tablist"
      >
        {METHODS.map((item) => {
          const active = item.key === method;
          return (
            <button
              aria-controls={`install-${item.key}`}
              aria-selected={active}
              className={cn(
                'col items-start gap-0.5 rounded-lg px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              id={`install-tab-${item.key}`}
              key={item.key}
              onClick={() => select(item.key)}
              role="tab"
              type="button"
            >
              <span className="font-medium">{item.label}</span>
              <span className="hidden text-muted-foreground text-xs sm:block">
                {item.hint}
              </span>
            </button>
          );
        })}
      </div>
      <div
        aria-labelledby={`install-tab-${method}`}
        id={`install-${method}`}
        role="tabpanel"
      >
        {method === 'ai' ? (
          <InstallWithAi
            context={context}
            projectId={projectId}
            projectName={projectName}
            projectTypes={projectTypes}
          />
        ) : (
          <InstallManual
            context={context}
            projectId={projectId}
            projectTypes={projectTypes}
          />
        )}
      </div>
    </div>
  );
}
