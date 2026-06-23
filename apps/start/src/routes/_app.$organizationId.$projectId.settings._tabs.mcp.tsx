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
import { Trans, useTranslation } from 'react-i18next';

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

const buildClients = (mcpEndpoint: string): AiClient[] => {
  const url = `${mcpEndpoint}?token=${TOKEN_PLACEHOLDER}`;

  return [
    {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      description: (
        <Trans
          components={{
            config: <code />,
            settings: <strong />,
          }}
          i18nKey="settings.mcp_claude_desktop_description"
        />
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
        <Trans
          components={{
            header: <code />,
          }}
          i18nKey="settings.mcp_claude_code_description"
        />
      ),
      language: 'bash',
      snippet: () => `claude mcp add --transport http openpanel "${url}"`,
    },
    {
      id: 'cursor',
      name: 'Cursor',
      description: (
        <Trans
          components={{
            global: <code />,
            project: <code />,
          }}
          i18nKey="settings.mcp_cursor_description"
        />
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
        <Trans
          components={{
            config: <code />,
            serverUrl: <code />,
            url: <code />,
          }}
          i18nKey="settings.mcp_windsurf_description"
        />
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
        <Trans
          components={{
            config: <code />,
          }}
          i18nKey="settings.mcp_vscode_description"
        />
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
        <Trans
          components={{
            command: <strong />,
          }}
          i18nKey="settings.mcp_raycast_description"
        />
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
  const clients = buildClients(mcpEndpoint);

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
          <Trans
            components={{
              encoded: <code />,
              header: <code />,
              token: <code />,
            }}
            i18nKey="settings.mcp_token_help"
          />
        </p>
      </div>

      <div className="col gap-3 rounded-lg border bg-def-200 p-4">
        <div className="col gap-1">
          <div className="font-medium">{t('settings.mcp_need_token_title')}</div>
          <p className="text-muted-foreground text-sm">
            <Trans
              components={{
                read: <code />,
                root: <code />,
              }}
              i18nKey="settings.mcp_need_token_description"
            />
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
