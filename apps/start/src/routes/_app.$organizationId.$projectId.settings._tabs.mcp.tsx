import { createFileRoute } from '@tanstack/react-router';
import { ExternalLinkIcon, PlusIcon } from 'lucide-react';
import CopyInput from '@/components/forms/copy-input';
import Syntax from '@/components/syntax';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/mcp',
)({
  component: Component,
});

const TOKEN_PLACEHOLDER = 'BASE64_TOKEN';
const DOCS_URL = 'https://openpanel.dev/docs/mcp';

type AiClient = {
  id: string;
  name: string;
  description: React.ReactNode;
  configFile?: string;
  language: 'json' | 'bash';
  snippet: (mcpUrl: string) => string;
};

const buildClients = (mcpEndpoint: string, t: TFunction): AiClient[] => {
  const url = `${mcpEndpoint}?token=${TOKEN_PLACEHOLDER}`;

  return [
    {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      description: (
        <>
          {t('settings.mcp_claude_desktop_description_prefix')}{' '}
          <code>claude_desktop_config.json</code>.{' '}
          {t('settings.mcp_claude_desktop_description_suffix')}{' '}
          <strong>{t('settings.mcp_claude_desktop_settings_path')}</strong>.
        </>
      ),
      configFile:
        'macOS: ~/Library/Application Support/Claude/claude_desktop_config.json',
      language: 'json',
      snippet: () =>
        JSON.stringify(
          {
            mcpServers: {
              openpanel: {
                type: 'streamable-http',
                url,
              },
            },
          },
          null,
          2,
        ),
    },
    {
      id: 'claude-code',
      name: 'Claude Code (CLI)',
      description: (
        <>
          {t('settings.mcp_claude_code_description_prefix')}{' '}
          <code>--header "Authorization: Bearer BASE64_TOKEN"</code>.
        </>
      ),
      language: 'bash',
      snippet: () => `claude mcp add --transport http openpanel "${url}"`,
    },
    {
      id: 'cursor',
      name: 'Cursor',
      description: (
        <>
          {t('settings.mcp_cursor_description_prefix')}{' '}
          <code>~/.cursor/mcp.json</code>{' '}
          {t('settings.mcp_cursor_description_suffix')}{' '}
          <code>.cursor/mcp.json</code>.
        </>
      ),
      configFile: '~/.cursor/mcp.json',
      language: 'json',
      snippet: () =>
        JSON.stringify(
          {
            mcpServers: {
              openpanel: {
                url,
                transport: 'streamable-http',
              },
            },
          },
          null,
          2,
        ),
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      description: (
        <>
          {t('settings.mcp_windsurf_description_prefix')}{' '}
          <code>~/.codeium/windsurf/mcp_config.json</code>.{' '}
          {t('settings.mcp_windsurf_description_suffix')}{' '}
          <code>serverUrl</code>{' '}
          {t('settings.mcp_windsurf_url_connector')} <code>url</code>.
        </>
      ),
      configFile: '~/.codeium/windsurf/mcp_config.json',
      language: 'json',
      snippet: () =>
        JSON.stringify(
          {
            mcpServers: {
              openpanel: {
                serverUrl: url,
              },
            },
          },
          null,
          2,
        ),
    },
    {
      id: 'vscode',
      name: 'VS Code (Copilot)',
      description: (
        <>
          {t('settings.mcp_vscode_description_prefix')}{' '}
          <code>.vscode/mcp.json</code>{' '}
          {t('settings.mcp_vscode_description_suffix')}
        </>
      ),
      configFile: '.vscode/mcp.json',
      language: 'json',
      snippet: () =>
        JSON.stringify(
          {
            servers: {
              openpanel: {
                type: 'http',
                url,
              },
            },
          },
          null,
          2,
        ),
    },
    {
      id: 'raycast',
      name: 'Raycast',
      description: (
        <>
          {t('settings.mcp_raycast_description_prefix')}{' '}
          <strong>{t('settings.mcp_raycast_install_server')}</strong>{' '}
          {t('settings.mcp_raycast_description_suffix')}
        </>
      ),
      language: 'json',
      snippet: () =>
        JSON.stringify(
          {
            name: 'openpanel',
            transport: 'streamable-http',
            url,
          },
          null,
          2,
        ),
    },
  ];
};

function Component() {
  const { t } = useTranslation();
  const { apiUrl } = useAppContext();
  const mcpEndpoint = `${apiUrl}/mcp`;
  const fullUrl = `${mcpEndpoint}?token=${TOKEN_PLACEHOLDER}`;
  const clients = buildClients(mcpEndpoint, t);

  return (
    <div className="col gap-6">
      <div className="col gap-2">
        <h2 className="font-semibold text-lg">{t('settings.mcp_title')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('settings.mcp_description')}
        </p>
      </div>

      <div className="col gap-2">
        <CopyInput label={t('settings.mcp_endpoint_label')} value={fullUrl} />
        <p className="text-muted-foreground text-xs">
          {t('settings.mcp_token_help_prefix')}{' '}
          <code>{TOKEN_PLACEHOLDER}</code>{' '}
          {t('settings.mcp_token_help_middle')}{' '}
          <code>base64(clientId:clientSecret)</code>.{' '}
          {t('settings.mcp_token_help_suffix')}{' '}
          <code>Authorization: Bearer</code>{' '}
          {t('settings.mcp_token_help_suffix_2')}
        </p>
      </div>

      <div className="col gap-3 rounded-lg border bg-def-200 p-4">
        <div className="col gap-1">
          <div className="font-medium">{t('settings.mcp_need_token_title')}</div>
          <p className="text-muted-foreground text-sm">
            {t('settings.mcp_need_token_description_prefix')}{' '}
            <code>read</code> {t('settings.mcp_need_token_description_middle')}{' '}
            <code>root</code> {t('settings.mcp_need_token_description_suffix')}
          </p>
        </div>
        <div>
          <Button icon={PlusIcon} onClick={() => pushModal('AddClient')}>
            {t('settings.mcp_create_client_button')}
          </Button>
        </div>
      </div>

      <div className="col gap-2">
        <div className="font-medium">
          {t('settings.mcp_configure_client_title')}
        </div>
        <Accordion className="rounded-lg border" collapsible type="single">
          {clients.map((client) => (
            <AccordionItem
              className="px-4"
              key={client.id}
              value={client.id}
            >
              <AccordionTrigger>{client.name}</AccordionTrigger>
              <AccordionContent className="col gap-3">
                <p className="text-muted-foreground text-sm">
                  {client.description}
                </p>
                {client.configFile && (
                  <p className="text-muted-foreground text-xs">
                    <span className="font-medium">
                      {t('settings.mcp_config_file_label')}
                    </span>{' '}
                    <code>{client.configFile}</code>
                  </p>
                )}
                <Syntax
                  className="border"
                  code={client.snippet(mcpEndpoint)}
                  language={client.language}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <a
        className={cn(buttonVariants({ variant: 'outline' }), 'self-start')}
        href={DOCS_URL}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLinkIcon className="h-4 w-4" />
        {t('settings.mcp_read_docs_button')}
      </a>
    </div>
  );
}
