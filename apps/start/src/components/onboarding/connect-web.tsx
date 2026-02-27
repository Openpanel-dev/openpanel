import type { IServiceClient } from '@openpanel/db';
import { frameworks } from '@openpanel/sdk-info';
import { CopyIcon, PlugIcon } from 'lucide-react';
import { Button } from '../ui/button';
import Syntax from '@/components/syntax';
import { useAppContext } from '@/hooks/use-app-context';
import { pushModal } from '@/modals';
import { clipboard } from '@/utils/clipboard';

interface Props {
  client: IServiceClient | null;
}

const ConnectWeb = ({ client }: Props) => {
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
    <>
      <div className="col gap-2">
        <div className="row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-xl capitalize">
            <PlugIcon className="size-4" />
            Quick start
          </div>
          <div className="row gap-2">
            <Button
              icon={CopyIcon}
              onClick={() => clipboard(code, null)}
              variant="outline"
            >
              Copy
            </Button>
          </div>
        </div>
        <Syntax className="border" code={code} />
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
    </>
  );
};

export default ConnectWeb;
