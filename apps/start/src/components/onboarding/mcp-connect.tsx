import { Link } from '@tanstack/react-router';
import { BotIcon, CopyIcon, ExternalLinkIcon, ZapIcon } from 'lucide-react';
import CopyInput from '@/components/forms/copy-input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button, buttonVariants } from '@/components/ui/button';
import { clipboard } from '@/utils/clipboard';
import { cn } from '@/utils/cn';
import { trackFunnel } from '@/utils/funnel-tracking';

const SERVER_NAME = 'openpanel';
const PANEL = 'mcp';

interface Connection {
  endpoint: string;
  token: string;
}

// Install links are documented by Cursor (base64 JSON config) and VS Code
// (percent-encoded JSON). Claude Code takes one command. claude.ai and
// ChatGPT have no deep link: the user pastes the URL as a custom connector,
// with the token in the query string because neither can send headers.
type Host =
  | {
      key: string;
      label: string;
      kind: 'install';
      href: (connection: Connection) => string;
    }
  | {
      key: string;
      label: string;
      kind: 'command';
      command: (connection: Connection) => string;
    }
  | {
      key: string;
      label: string;
      kind: 'paste';
      settingsUrl: string;
      hint: string;
    };

const HOSTS: Host[] = [
  {
    key: 'cursor',
    label: 'Cursor',
    kind: 'install',
    href: ({ endpoint, token }) => {
      const config = btoa(
        JSON.stringify({
          url: endpoint,
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`;
    },
  },
  {
    key: 'vscode',
    label: 'VS Code',
    kind: 'install',
    href: ({ endpoint, token }) =>
      `vscode:mcp/install?${encodeURIComponent(
        JSON.stringify({
          name: SERVER_NAME,
          type: 'http',
          url: endpoint,
          headers: { Authorization: `Bearer ${token}` },
        })
      )}`,
  },
  {
    key: 'claude-code',
    label: 'Claude Code',
    kind: 'command',
    command: ({ endpoint, token }) =>
      `claude mcp add --transport http ${SERVER_NAME} ${endpoint} --header "Authorization: Bearer ${token}"`,
  },
  {
    key: 'claude',
    label: 'Claude',
    kind: 'paste',
    settingsUrl: 'https://claude.ai/settings/connectors',
    hint: 'Settings → Connectors → Add custom connector',
  },
  {
    key: 'chatgpt',
    label: 'ChatGPT',
    kind: 'paste',
    settingsUrl: 'https://chatgpt.com/#settings/Connectors',
    hint: 'Settings → Connectors → Create (Developer mode)',
  },
];

const KIND_CAPTIONS: Record<Host['kind'], string> = {
  install: 'One click',
  command: 'One command',
  paste: 'Paste the URL',
};

interface Props {
  projectId: string;
  organizationId: string;
  apiUrl: string;
  /** Token of the project's read-only MCP client; null once the session that created it is gone. */
  mcpToken: string | null;
}

/** The MCP token and the quickest documented route into each assistant. */
export function McpConnect({
  projectId,
  organizationId,
  apiUrl,
  mcpToken,
}: Props) {
  const connection: Connection | null = mcpToken
    ? { endpoint: `${apiUrl}/mcp`, token: mcpToken }
    : null;

  const track = (host: Host) =>
    trackFunnel('onboarding_mcp_connect_clicked', {
      projectId,
      host: host.key,
      kind: host.kind,
    });

  const renderAction = (host: Host, current: Connection) => {
    if (host.kind === 'install') {
      return (
        <a
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          href={host.href(current)}
          onClick={() => track(host)}
        >
          <ZapIcon className="mr-1.5 size-3.5" />
          Install
        </a>
      );
    }
    if (host.kind === 'command') {
      return (
        <Button
          icon={CopyIcon}
          onClick={() => {
            track(host);
            clipboard(host.command(current), 'Run it in your terminal');
          }}
          size="sm"
          variant="outline"
        >
          Copy command
        </Button>
      );
    }
    return (
      <Button
        icon={ExternalLinkIcon}
        onClick={() => {
          track(host);
          clipboard(
            `${current.endpoint}?token=${current.token}`,
            `Paste it as the server URL: ${host.hint}`
          );
          window.open(host.settingsUrl, '_blank', 'noopener');
        }}
        size="sm"
        variant="outline"
      >
        Copy URL
      </Button>
    );
  };

  return (
    <Accordion
      className="rounded-xl border"
      collapsible
      onValueChange={(value) =>
        trackFunnel('onboarding_mcp_connect_toggled', {
          projectId,
          open: value === PANEL,
          hadToken: Boolean(mcpToken),
        })
      }
      type="single"
    >
      <AccordionItem className="border-b-0" value={PANEL}>
        <AccordionTrigger className="gap-4 rounded-xl p-5 text-left">
          <span className="col gap-1.5">
            <span className="row items-center gap-2">
              <BotIcon className="shrink-0 text-muted-foreground" size={16} />
              <span className="font-semibold text-base">
                Connect an AI assistant
              </span>
            </span>
            <span className="font-normal text-muted-foreground text-sm">
              Give Cursor, Claude or ChatGPT read access to this project over
              MCP and ask it questions instead of building reports.
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="col gap-4 px-5 pb-5">
          {connection ? (
            <>
              <ul className="col divide-y">
                {HOSTS.map((host) => (
                  <li
                    className="row items-center justify-between gap-3 py-2.5"
                    key={host.key}
                  >
                    <div className="col">
                      <span className="font-medium text-sm">{host.label}</span>
                      <span className="text-muted-foreground text-xs">
                        {KIND_CAPTIONS[host.kind]}
                      </span>
                    </div>
                    {renderAction(host, connection)}
                  </li>
                ))}
              </ul>
              <CopyInput
                label="MCP token"
                onCopy={() =>
                  trackFunnel('onboarding_credentials_copied', {
                    projectId,
                    what: 'mcpToken',
                  })
                }
                value={connection.token}
              />
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              The MCP token was shown once when the project was created. Create
              another MCP client to connect an assistant.
            </p>
          )}
          <Link
            className="self-start text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
            onClick={() =>
              trackFunnel('onboarding_mcp_settings_clicked', {
                projectId,
                hadToken: Boolean(mcpToken),
              })
            }
            params={{ organizationId, projectId }}
            to="/$organizationId/$projectId/settings/mcp"
          >
            Windsurf, Raycast and config files in Settings → MCP
          </Link>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
