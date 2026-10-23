import { CopyIcon, DownloadIcon } from 'lucide-react';
import CopyInput from '@/components/forms/copy-input';
import { Button } from '@/components/ui/button';
import { clipboard } from '@/utils/clipboard';

interface Props {
  clientId: string;
  /** Only known in the browser session that created the client; stored hashed otherwise. */
  clientSecret: string | null;
}

/** Everything the SDKs and the MCP server need to authenticate as this project. */
export function ClientCredentials({ clientId, clientSecret }: Props) {
  const mcpToken = clientSecret ? btoa(`${clientId}:${clientSecret}`) : null;
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
    <div className="col gap-4">
      <div className="grid gap-3 [&>*]:min-w-0">
        <CopyInput label="Client ID" value={clientId} />
        {clientSecret && (
          <CopyInput label="Client secret" value={clientSecret} />
        )}
        {mcpToken && <CopyInput label="MCP token" value={mcpToken} />}
      </div>
      <p className="text-muted-foreground text-sm">
        {clientSecret
          ? 'The secret and the MCP token are shown only now. Save them if you plan to track from a server or an app, or to connect an AI assistant over MCP.'
          : 'The client secret is only shown once, right after the client is created. Create a new client under Settings → Clients if you need another.'}
      </p>
      <div className="row flex-wrap gap-2">
        <Button
          icon={CopyIcon}
          onClick={() => clipboard(credentials)}
          variant="outline"
        >
          Copy all
        </Button>
        <Button icon={DownloadIcon} onClick={download} variant="outline">
          Download
        </Button>
      </div>
    </div>
  );
}
