import type { Framework } from '@openpanel/sdk-info';
import { ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { FrameworkPicker, frameworksFor } from './framework-picker';
import {
  getInstallSnippets,
  type SnippetContext,
  usesClientSecret,
} from './install-snippets';
import Syntax from '@/components/syntax';
import { op } from '@/utils/op';

type ProjectType = 'website' | 'app' | 'backend';

interface Props {
  projectId: string;
  projectTypes: ProjectType[];
  context: SnippetContext;
}

export function InstallManual({ projectId, projectTypes, context }: Props) {
  const [framework, setFramework] = useState<Framework>(
    () => frameworksFor(projectTypes).suggested[0]!
  );
  const snippets = getInstallSnippets(framework, context);
  const secretMissing = usesClientSecret(framework) && !context.clientSecret;

  const select = (next: Framework | null) => {
    if (!next) {
      return;
    }
    op.track('onboarding_framework_selected', {
      projectId,
      framework: next.key,
    });
    setFramework(next);
  };

  return (
    <div className="col gap-6">
      <FrameworkPicker
        onChange={select}
        projectTypes={projectTypes}
        value={framework}
      />

      <div className="col gap-5">
        {snippets.map((snippet, index) => (
          <div className="col gap-2" key={snippet.title}>
            <div className="row items-center gap-2 font-medium">
              <span className="center-center size-5 rounded-full bg-def-200 text-xs tabular-nums dark:bg-def-300">
                {index + 1}
              </span>
              {snippet.title}
            </div>
            <Syntax
              className="border"
              code={snippet.code}
              language={snippet.language}
              wrapLines={snippet.language === 'markdown'}
            />
          </div>
        ))}
        {snippets.length === 0 && (
          <p className="text-muted-foreground">
            {framework.name} is a community SDK. Its guide covers installation
            and usage.
          </p>
        )}
        {secretMissing && (
          <p className="rounded-lg bg-def-200 p-3 text-muted-foreground text-sm dark:bg-def-300">
            The client secret is only shown once, right after the client is
            created. Replace YOUR_CLIENT_SECRET with the one you saved, or
            create a new client under Settings → Clients.
          </p>
        )}
        <a
          className="row items-center gap-1.5 self-start text-sm underline hover:text-foreground"
          href={framework.href}
          rel="noreferrer"
          target="_blank"
        >
          Full {framework.name} guide
          <ExternalLinkIcon size={14} />
        </a>
      </div>
    </div>
  );
}
