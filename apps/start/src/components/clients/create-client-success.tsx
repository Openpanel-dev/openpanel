import { CopyIcon, DownloadIcon, RocketIcon } from 'lucide-react';
import CopyInput from '../forms/copy-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isRealClientSecret } from '@/hooks/use-client-secret';
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';
import { clipboard } from '@/utils/clipboard';

// `type` is required on purpose: MCP rejects write clients, so a caller that
// forgets it must not get a token rendered by accident.
type Props = { id: string; secret: string; type: 'read' | 'write' | 'root' };

export function CreateClientSuccess({ id, secret, type }: Props) {
  const { t: translateUi } = useDashboardTranslation();

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
      <CopyInput label={translateUi('Client ID')} value={id} />
      {hasSecret && (
        <div className="w-full min-w-0">
          <CopyInput label={translateUi('Secret')} value={secret} />
          <p className="mt-1 text-muted-foreground text-sm">
            <DashboardText
              i18nKey={
                'You will only need the secret if you want to send server events.'
              }
            />{' '}
          </p>
        </div>
      )}
      {showMcpToken && (
        <div className="w-full min-w-0">
          <CopyInput label={translateUi('MCP Token')} value={mcpToken} />
          <p className="mt-1 text-muted-foreground text-sm">
            <DashboardText
              i18nKey={
                'Use this token to authenticate with the MCP server (base64 encoded client ID and secret).'
              }
            />{' '}
          </p>
        </div>
      )}
      {type === 'write' && (
        <p className="text-muted-foreground text-sm">
          <DashboardText
            i18nKey={
              'Write clients cannot be used with MCP. For an AI assistant, create a read client under Settings → MCP.'
            }
          />{' '}
        </p>
      )}
      <div className="row gap-2 [&>*]:flex-1">
        <Button
          icon={CopyIcon}
          onClick={() => clipboard(credentials)}
          variant="outline"
        >
          <DashboardText i18nKey={'Copy all'} />{' '}
        </Button>
        <Button icon={DownloadIcon} onClick={download} variant="outline">
          <DashboardText i18nKey={'Save credentials'} />{' '}
        </Button>
      </div>
      <Alert>
        <RocketIcon className="h-4 w-4" />
        <AlertTitle>
          <DashboardText i18nKey={'Get started!'} />
        </AlertTitle>
        <AlertDescription>
          <DashboardText i18nKey={'Read our'} />{' '}
          <a
            className="underline"
            href="https://openpanel.dev/docs"
            rel="noreferrer"
            target="_blank"
          >
            <DashboardText i18nKey={'documentation'} />{' '}
          </a>{' '}
          <DashboardText i18nKey={'to get started. Easy peasy!'} />{' '}
        </AlertDescription>
      </Alert>
    </div>
  );
}
