import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DownloadIcon, RocketIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import CopyInput from '../forms/copy-input';

type Props = { id: string; secret: string; type?: 'read' | 'write' | 'root' };

export function CreateClientSuccess({ id, secret, type }: Props) {
  const { t } = useTranslation();
  const mcpToken = btoa(`${id}:${secret}`);
  const showMcpToken = type === 'root' || type === 'read';

  const download = () => {
    const credentials = showMcpToken
      ? `CLIENT_ID=${id}\nCLIENT_SECRET=${secret}\nMCP_TOKEN=${mcpToken}`
      : `CLIENT_ID=${id}\nCLIENT_SECRET=${secret}`;
    const blob = new Blob([credentials], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'credentials.txt';
    a.click();
  };

  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <CopyInput label={t('clients.field_client_id')} value={id} />
      {secret && (
        <div className="w-full min-w-0">
          <CopyInput label={t('clients.field_secret')} value={secret} />
          <p className="mt-1 text-sm text-muted-foreground">
            {t('clients.secret_help')}
          </p>
        </div>
      )}
      {secret && showMcpToken && (
        <div className="w-full min-w-0">
          <CopyInput label={t('clients.field_mcp_token')} value={mcpToken} />
          <p className="mt-1 text-sm text-muted-foreground">
            {t('clients.mcp_token_help')}
          </p>
        </div>
      )}
      <Button variant="outline" icon={DownloadIcon} onClick={download}>
        {t('clients.action_save_credentials')}
      </Button>
      <Alert>
        <RocketIcon className="h-4 w-4" />
        <AlertTitle>{t('clients.get_started_title')}</AlertTitle>
        <AlertDescription>
          {t('clients.get_started_read_our')}{' '}
          <a
            target="_blank"
            href="https://openpanel.dev/docs"
            className="underline"
            rel="noreferrer"
          >
            {t('sidebar.docs')}
          </a>{' '}
          {t('clients.get_started_suffix')}
        </AlertDescription>
      </Alert>
    </div>
  );
}
