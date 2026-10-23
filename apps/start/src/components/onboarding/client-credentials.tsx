import { CopyIcon, DownloadIcon, KeyRoundIcon } from 'lucide-react';
import CopyInput from '@/components/forms/copy-input';
import { Button } from '@/components/ui/button';
import { clipboard } from '@/utils/clipboard';
import { trackFunnel } from '@/utils/funnel-tracking';

interface Props {
  clientId: string;
  /** Only known in the browser session that created the client; stored hashed otherwise. */
  clientSecret: string | null;
  /** Token of the read-only MCP client created with the project; same one-time rule. */
  mcpToken: string | null;
  projectId: string;
}

/** What the SDKs need to send events; the MCP token rides along in the download. */
export function ClientCredentials({
  clientId,
  clientSecret,
  mcpToken,
  projectId,
}: Props) {
  const isOneTimeView = Boolean(clientSecret);
  const credentials = [
    `CLIENT_ID=${clientId}`,
    clientSecret && `CLIENT_SECRET=${clientSecret}`,
    mcpToken && `MCP_TOKEN=${mcpToken}`,
  ]
    .filter(Boolean)
    .join('\n');

  const copied = (what: string) =>
    trackFunnel('onboarding_credentials_copied', { projectId, what });

  const download = () => {
    copied('download');
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
        <CopyInput
          label="Client ID"
          onCopy={() => copied('clientId')}
          value={clientId}
        />
        {clientSecret && (
          <CopyInput
            label="Client secret"
            onCopy={() => copied('clientSecret')}
            value={clientSecret}
          />
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        {isOneTimeView
          ? 'The secret is shown only once. Save it if you track from a server or an app.'
          : 'Secrets are shown once, right after a project is created. Create a new client under Settings → Clients if you need another.'}
      </p>
      {isOneTimeView && (
        <div className="row flex-wrap gap-2">
          <Button
            icon={CopyIcon}
            onClick={() => {
              copied('all');
              clipboard(credentials);
            }}
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
