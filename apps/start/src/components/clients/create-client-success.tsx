import { CopyIcon, DownloadIcon, RocketIcon } from 'lucide-react';
import CopyInput from '../forms/copy-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isRealClientSecret } from '@/hooks/use-client-secret';
import { clipboard } from '@/utils/clipboard';

type Props = { id: string; secret: string; type?: 'read' | 'write' | 'root' };

export function CreateClientSuccess({ id, secret, type }: Props) {
  // Only derive credentials from a real secret — the '[CLIENT_SECRET]'
  // placeholder is truthy and would render a valid-looking but broken token.
  const hasSecret = isRealClientSecret(secret);
  const mcpToken = hasSecret ? btoa(`${id}:${secret}`) : null;
  const showMcpToken = !!mcpToken && (type === 'root' || type === 'read');

  const credentials = [
    `CLIENT_ID=${id}`,
    hasSecret && `CLIENT_SECRET=${secret}`,
    showMcpToken && `MCP_TOKEN=${mcpToken}`,
  ]
    .filter(Boolean)
    .join('\n');

  const download = () => {
    const blob = new Blob([credentials], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'credentials.txt';
    a.click();
  };

  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <CopyInput label="Client ID" value={id} />
      {hasSecret && (
        <div className="w-full min-w-0">
          <CopyInput label="Secret" value={secret} />
          <p className="mt-1 text-muted-foreground text-sm">
            You will only need the secret if you want to send server events.
          </p>
        </div>
      )}
      {showMcpToken && (
        <div className="w-full min-w-0">
          <CopyInput label="MCP Token" value={mcpToken} />
          <p className="mt-1 text-muted-foreground text-sm">
            Use this token to authenticate with the MCP server (base64 encoded
            client ID and secret).
          </p>
        </div>
      )}
      <div className="row gap-2 [&>*]:flex-1">
        <Button
          icon={CopyIcon}
          onClick={() => clipboard(credentials)}
          variant="outline"
        >
          Copy all
        </Button>
        <Button icon={DownloadIcon} onClick={download} variant="outline">
          Save credentials
        </Button>
      </div>
      <Alert>
        <RocketIcon className="h-4 w-4" />
        <AlertTitle>Get started!</AlertTitle>
        <AlertDescription>
          Read our{' '}
          <a
            className="underline"
            href="https://openpanel.dev/docs"
            rel="noreferrer"
            target="_blank"
          >
            documentation
          </a>{' '}
          to get started. Easy peasy!
        </AlertDescription>
      </Alert>
    </div>
  );
}
