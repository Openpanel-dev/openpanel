import { pushModal } from '@/modals';
import { MonitorIcon } from 'lucide-react';

import Syntax from '@/components/syntax';
import type { IServiceClient } from '@openpanel/db';
import { frameworks } from '@openpanel/sdk-info';

type Props = {
  client: IServiceClient | null;
};

const ConnectWeb = ({ client }: Props) => {
  return (
    <div className="rounded-lg border p-4 md:p-6 col gap-4">
      <div className="flex items-center gap-2 text-2xl capitalize">
        <MonitorIcon />
        Website
      </div>

      <div>
        <div className="text-lg font-medium mb-2">
          Paste the script to your website
        </div>
        <Syntax
          className="border"
          code={`<script>
  window.op = window.op||function(...args){(window.op.q=window.op.q||[]).push(args);};
  window.op('init', {
    clientId: '${client?.id ?? 'YOUR_CLIENT_ID'}',
    trackScreenViews: true,
    trackOutgoingLinks: true,
    trackAttributes: true,
  });
</script>
<script src="https://openpanel.dev/op1.js" defer async></script>`}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-2">
          Or pick a framework below to get started.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {frameworks
            .filter((framework) => framework.type.includes('website'))
            .map((framework) => (
              <button
                type="button"
                onClick={() =>
                  pushModal('Instructions', {
                    framework,
                    client,
                  })
                }
                className="flex items-center gap-4 rounded-md border p-2 py-2 text-left"
                key={framework.name}
              >
                <div className="h-10 w-10 rounded-md bg-def-200 p-2">
                  <framework.IconComponent className="h-full w-full" />
                </div>
                <div className="flex-1 font-semibold">{framework.name}</div>
              </button>
            ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Missing a framework?{' '}
          <a
            href="mailto:hello@openpanel.dev"
            className="text-foreground underline"
          >
            Let us know!
          </a>
        </p>
      </div>
    </div>
  );
};

export default ConnectWeb;
