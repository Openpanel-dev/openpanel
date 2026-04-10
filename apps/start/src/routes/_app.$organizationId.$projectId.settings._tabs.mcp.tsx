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
        <>
          Add the following block to <code>claude_desktop_config.json</code>.
          You can open it from <strong>Settings → Developer → Edit Config</strong>.
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
          Run this once in your terminal. The token can also be passed as a
          header via <code>--header "Authorization: Bearer BASE64_TOKEN"</code>.
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
          Add the server to your global config at <code>~/.cursor/mcp.json</code>{' '}
          or your project config at <code>.cursor/mcp.json</code>.
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
          Add the server to <code>~/.codeium/windsurf/mcp_config.json</code>.
          Windsurf accepts both <code>serverUrl</code> and <code>url</code>.
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
          Add the server to <code>.vscode/mcp.json</code> in your workspace, or
          to your user-level MCP config.
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
          Copy the JSON below, then run the <strong>Install Server</strong>{' '}
          command in Raycast — it auto-fills the form from your clipboard.
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
  const { apiUrl } = useAppContext();
  const mcpEndpoint = `${apiUrl}/mcp`;
  const fullUrl = `${mcpEndpoint}?token=${TOKEN_PLACEHOLDER}`;
  const clients = buildClients(mcpEndpoint);

  return (
    <div className="col gap-6">
      <div className="col gap-2">
        <h2 className="font-semibold text-lg">MCP Server</h2>
        <p className="text-muted-foreground text-sm">
          Connect any MCP-compatible AI client (Claude, Cursor, Windsurf, …) to
          your OpenPanel data. The server is read-only and exposes 38 tools for
          querying events, sessions, profiles, funnels, retention and more.
        </p>
      </div>

      <div className="col gap-2">
        <CopyInput label="Endpoint" value={fullUrl} />
        <p className="text-muted-foreground text-xs">
          Replace <code>{TOKEN_PLACEHOLDER}</code> with{' '}
          <code>base64(clientId:clientSecret)</code>. You can also pass it as an{' '}
          <code>Authorization: Bearer</code> header instead of a query param.
        </p>
      </div>

      <div className="col gap-3 rounded-lg border bg-def-200 p-4">
        <div className="col gap-1">
          <div className="font-medium">Need a token?</div>
          <p className="text-muted-foreground text-sm">
            Only <code>read</code> and <code>root</code> clients can authenticate
            with MCP. Create one and copy the MCP token from the success screen
            — it's only shown once.
          </p>
        </div>
        <div>
          <Button icon={PlusIcon} onClick={() => pushModal('AddClient')}>
            Create MCP client
          </Button>
        </div>
      </div>

      <div className="col gap-2">
        <div className="font-medium">Configure your AI client</div>
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
                    <span className="font-medium">Config file:</span>{' '}
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
        Read the full MCP docs
      </a>
    </div>
  );
}
