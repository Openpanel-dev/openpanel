import type { IServiceClient } from '@openpanel/db';
import { frameworks } from '@openpanel/sdk-info';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CopyIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import Syntax from '@/components/syntax';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { useAppContext } from '@/hooks/use-app-context';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { clipboard } from '@/utils/clipboard';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/tracking'
)({
  component: Component,
});

function Component() {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const query = useQuery(trpc.client.list.queryOptions({ projectId }));
  return <ConnectWeb clients={query.data ?? []} />;
}

interface Props {
  clients: IServiceClient[];
}

const ConnectWeb = ({ clients }: Props) => {
  const [client, setClient] = useState<IServiceClient | null>(null);
  useEffect(() => {
    if (!client && clients && clients.length > 0) {
      setClient(clients[0]);
    }
  }, [clients]);
  const context = useAppContext();
  const code = `<script>
  window.op=window.op||function(){var n=[];return new Proxy(function(){arguments.length&&n.push([].slice.call(arguments))},{get:function(t,r){return"q"===r?n:function(){n.push([r].concat([].slice.call(arguments)))}} ,has:function(t,r){return"q"===r}}) }();
  window.op('init', {${context.isSelfHosted ? `\n\tapiUrl: '${context.apiUrl}',` : ''}
    clientId: '${client?.id ?? 'YOUR_CLIENT_ID'}',
    trackScreenViews: true,
    trackOutgoingLinks: true,
    trackAttributes: true,
    // sessionReplay: {
    //   enabled: true,
    // },
  });
</script>
<script src="https://openpanel.dev/op1.js" defer async></script>`;
  return (
    <div className="col gap-4">
      <div className="col gap-2">
        <div className="row items-center justify-between gap-4">
          <Combobox
            items={clients.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
            onChange={(id) =>
              setClient(clients.find((c) => c.id === id) ?? null)
            }
            placeholder="Select client"
            searchable
            value={client?.id ?? null}
          />
          <Button
            icon={CopyIcon}
            onClick={() => clipboard(code, null)}
            variant="outline"
          >
            Copy
          </Button>
        </div>
        <Syntax className="border" code={code} copyable={false} />
      </div>
      <div className="col gap-4">
        <p className="text-center text-muted-foreground text-sm">
          Or pick a framework below to get started.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {frameworks.map((framework) => (
            <button
              className="flex items-center gap-4 rounded-md border p-2 text-left"
              key={framework.name}
              onClick={() =>
                pushModal('Instructions', {
                  framework,
                  client,
                })
              }
              type="button"
            >
              <div className="h-10 w-10 rounded-md bg-def-200 p-2">
                <framework.IconComponent className="h-full w-full" />
              </div>
              <div className="flex-1 font-semibold">{framework.name}</div>
            </button>
          ))}
        </div>
        <p className="text-center text-muted-foreground text-sm">
          Missing a framework?{' '}
          <a
            className="text-foreground underline"
            href="mailto:hello@openpanel.dev"
          >
            Let us know!
          </a>
        </p>
      </div>
    </div>
  );
};
