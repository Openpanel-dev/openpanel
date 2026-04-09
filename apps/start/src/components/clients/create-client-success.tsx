import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DownloadIcon, RocketIcon } from 'lucide-react';

import CopyInput from '../forms/copy-input';

type Props = { id: string; secret: string };

export function CreateClientSuccess({ id, secret }: Props) {
  const mcpToken = btoa(`${id}:${secret}`);

  const download = () => {
    const credentials = `CLIENT_ID=${id}\nCLIENT_SECRET=${secret}\nMCP_TOKEN=${mcpToken}`;
    const blob = new Blob([credentials], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'credentials.txt';
    a.click();
  };

  return (
    <div className="grid gap-4">
      <CopyInput label="Client ID" value={id} />
      {secret && (
        <div className="w-full">
          <CopyInput label="Secret" value={secret} />
          <p className="mt-1 text-sm text-muted-foreground">
            You will only need the secret if you want to send server events.
          </p>
        </div>
      )}
      {secret && (
        <div className="w-full">
          <CopyInput label="MCP Token" value={mcpToken} />
          <p className="mt-1 text-sm text-muted-foreground">
            Use this token to authenticate with the MCP server (base64 encoded
            client ID and secret).
          </p>
        </div>
      )}
      <Button variant="outline" icon={DownloadIcon} onClick={download}>
        Save credentials
      </Button>
      <Alert>
        <RocketIcon className="h-4 w-4" />
        <AlertTitle>Get started!</AlertTitle>
        <AlertDescription>
          Read our{' '}
          <a
            target="_blank"
            href="https://openpanel.dev/docs"
            className="underline"
            rel="noreferrer"
          >
            documentation
          </a>{' '}
          to get started. Easy peasy!
        </AlertDescription>
      </Alert>
    </div>
  );
}
