import { CopyIcon, DownloadIcon, KeyRoundIcon } from 'lucide-react';
import CopyInput from '@/components/forms/copy-input';
import { Button } from '@/components/ui/button';
import { clipboard } from '@/utils/clipboard';

interface Props {
  clientId: string;
  /** Only known in the browser session that created the client; stored hashed otherwise. */
  clientSecret: string | null;
  /** Token of the read-only MCP client created with the project; same one-time rule. */
  mcpToken: string | null;
}

/** Everything the SDKs and an MCP client need to authenticate as this project. */
export function ClientCredentials({ clientId, clientSecret, mcpToken }: Props) {
  const isOneTimeView = Boolean(clientSecret || mcpToken);
  const credentials = [
    `CLIENT_ID=${clientId}`,
    clientSecret && `CLIENT_SECRET=${clientSecret}`,
    mcpToken && `MCP_TOKEN=${mcpToken}`,
  ]
    .filter(Boolean)
    .join('\n');

  const download = () => {
    const blob = new Blob([credentials], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'openpanel-credentials.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="col gap-4 rounded-xl border p-5">
      <div className="row items-center gap-2">
        <KeyRoundIcon className="text-muted-foreground" size={16} />
        <h2 className="font-semibold text-base">Your keys</h2>
      </div>
      <div className="grid gap-3 [&>*]:min-w-0">
        <CopyInput label="Client ID" value={clientId} />
        {clientSecret && (
          <CopyInput label="Client secret" value={clientSecret} />
        )}
        {mcpToken && <CopyInput label="MCP token" value={mcpToken} />}
      </div>
      <p className="text-muted-foreground text-sm">
        {isOneTimeView
          ? 'The secret and the MCP token are shown only now. The client ID goes in your website snippet; the secret is for servers and apps; the MCP token connects Claude, Cursor or any MCP client to this project.'
          : 'Secrets are shown once, right after a project is created. Create a new client under Settings → Clients, or an MCP client under Settings → MCP, if you need another.'}
      </p>
      {isOneTimeView && (
        <div className="row flex-wrap gap-2">
          <Button
            icon={CopyIcon}
            onClick={() => clipboard(credentials)}
            size="sm"
            variant="outline"
          >
            Copy all
          </Button>
          <Button
            icon={DownloadIcon}
            onClick={download}
            size="sm"
            variant="outline"
          >
            Download
          </Button>
        </div>
      )}
    </section>
  );
}
