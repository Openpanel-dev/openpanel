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
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/mcp'
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
  const url = mcpEndpoint;
  const headers = { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` };
  // Fallback for clients that can't send headers.
  const urlWithToken = `${mcpEndpoint}?token=${TOKEN_PLACEHOLDER}`;

  return [
    {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      description: (
        <>
          <DashboardText i18nKey={'Add the following block to'} />{' '}
          <code>claude_desktop_config.json</code>. You can open it from{' '}
          <strong>
            <DashboardText i18nKey={'Settings → Developer → Edit Config'} />
          </strong>
          .
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
                headers,
              },
            },
          },
          null,
          2
        ),
    },
    {
      id: 'claude-code',
      name: 'Claude Code (CLI)',
      description: (
        <>
          <DashboardText
            i18nKey={
              "Run this once in your terminal. If your setup can't pass headers, use"
            }
          />{' '}
          <code>"{urlWithToken}"</code>{' '}
          <DashboardText i18nKey={'as the URL instead and drop the'} />{' '}
          <code>--header</code> <DashboardText i18nKey={'flag.'} />{' '}
        </>
      ),
      language: 'bash',
      snippet: () =>
        `claude mcp add --transport http openpanel ${url} \\\n  --header "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`,
    },
    {
      id: 'cursor',
      name: 'Cursor',
      description: (
        <>
          <DashboardText i18nKey={'Add the server to your global config at'} />{' '}
          <code>~/.cursor/mcp.json</code>{' '}
          <DashboardText i18nKey={'or your project config at'} />{' '}
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
                headers,
              },
            },
          },
          null,
          2
        ),
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      description: (
        <>
          <DashboardText i18nKey={'Add the server to'} />{' '}
          <code>~/.codeium/windsurf/mcp_config.json</code>. Windsurf accepts
          both <code>serverUrl</code> <DashboardText i18nKey={'and'} />{' '}
          <code>url</code>.
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
                headers,
              },
            },
          },
          null,
          2
        ),
    },
    {
      id: 'vscode',
      name: 'VS Code (Copilot)',
      description: (
        <>
          <DashboardText i18nKey={'Add the server to'} />{' '}
          <code>.vscode/mcp.json</code>{' '}
          <DashboardText
            i18nKey={'in your workspace, or to your user-level MCP config.'}
          />{' '}
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
                headers,
              },
            },
          },
          null,
          2
        ),
    },
    {
      id: 'raycast',
      name: 'Raycast',
      description: (
        <>
          <DashboardText i18nKey={'Copy the JSON below, then run the'} />{' '}
          <strong>
            <DashboardText i18nKey={'Install Server'} />
          </strong>{' '}
          <DashboardText
            i18nKey={
              'command in Raycast — it auto-fills the form from your clipboard. The install form takes a URL only, so the token goes in the query string.'
            }
          />{' '}
        </>
      ),
      language: 'json',
      snippet: () =>
        JSON.stringify(
          {
            name: 'openpanel',
            transport: 'streamable-http',
            url: urlWithToken,
          },
          null,
          2
        ),
    },
  ];
};

function Component() {
  const { t: translateUi } = useDashboardTranslation();

  const { apiUrl } = useAppContext();
  const mcpEndpoint = `${apiUrl}/mcp`;
  const clients = buildClients(mcpEndpoint);

  return (
    <div className="col gap-6">
      <div className="col gap-2">
        <h2 className="font-semibold text-lg">
          <DashboardText i18nKey={'MCP Server'} />
        </h2>
        <p className="text-muted-foreground text-sm">
          <DashboardText
            i18nKey={
              'Connect any MCP-compatible AI client (Claude, Cursor, Windsurf, …) to your OpenPanel data. Most of its tools read — events, sessions, profiles, funnels, retention and more — but it can also create, edit and delete dashboards and reports, so treat the token as write access.'
            }
          />{' '}
        </p>
      </div>

      <div className="col gap-2">
        <CopyInput label={translateUi('Endpoint')} value={mcpEndpoint} />
        <p className="text-muted-foreground text-xs">
          <DashboardText i18nKey={'Send your token as an'} />{' '}
          <code>Authorization: Bearer</code>{' '}
          <DashboardText i18nKey={'header, with'} />{' '}
          <code>base64(clientId:clientSecret)</code>{' '}
          <DashboardText i18nKey={'in place of'} />{' '}
          <code>{TOKEN_PLACEHOLDER}</code>. Clients that can't set headers take
          it as a <code>?token=</code>{' '}
          <DashboardText i18nKey={'query param instead.'} />{' '}
        </p>
      </div>

      <div className="col gap-3 rounded-lg border bg-def-200 p-4">
        <div className="col gap-1">
          <div className="font-medium">
            <DashboardText i18nKey={'Need a token?'} />
          </div>
          <p className="text-muted-foreground text-sm">
            <DashboardText i18nKey={'Only'} /> <code>read</code>{' '}
            <DashboardText i18nKey={'and'} /> <code>root</code>{' '}
            <DashboardText
              i18nKey={
                "clients can authenticate with MCP. Create one and copy the MCP token from the success screen — it's only shown once."
              }
            />{' '}
          </p>
        </div>
        <div>
          <Button icon={PlusIcon} onClick={() => pushModal('AddClient')}>
            <DashboardText i18nKey={'Create MCP client'} />{' '}
          </Button>
        </div>
      </div>

      <div className="col gap-2">
        <div className="font-medium">
          <DashboardText i18nKey={'Configure your AI client'} />
        </div>
        <Accordion className="rounded-lg border" collapsible type="single">
          {clients.map((client) => (
            <AccordionItem className="px-4" key={client.id} value={client.id}>
              <AccordionTrigger>{client.name}</AccordionTrigger>
              <AccordionContent className="col gap-3">
                <p className="text-muted-foreground text-sm">
                  {client.description}
                </p>
                {client.configFile && (
                  <p className="text-muted-foreground text-xs">
                    <span className="font-medium">
                      <DashboardText i18nKey={'Config file:'} />
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
        <DashboardText i18nKey={'Read the full MCP docs'} />{' '}
      </a>
    </div>
  );
}
