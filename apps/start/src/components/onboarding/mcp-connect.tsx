import { Link } from '@tanstack/react-router';
import { BotIcon, ExternalLinkIcon } from 'lucide-react';
import CopyInput from '@/components/forms/copy-input';
import { Button } from '@/components/ui/button';
import { clipboard } from '@/utils/clipboard';
import { op } from '@/utils/op';

// Both hosts add a remote MCP server by URL and cannot send headers, so the
// token travels in the query string (see the MCP docs).
const HOSTS = [
  {
    key: 'chatgpt',
    label: 'ChatGPT',
    settingsUrl: 'https://chatgpt.com/#settings/Connectors',
    hint: 'Settings → Connectors → Create',
  },
  {
    key: 'claude',
    label: 'Claude',
    settingsUrl: 'https://claude.ai/settings/connectors',
    hint: 'Settings → Connectors → Add custom connector',
  },
] as const;

interface Props {
  projectId: string;
  organizationId: string;
  apiUrl: string;
  /** Token of the project's read-only MCP client; null once the session that created it is gone. */
  mcpToken: string | null;
}

/** The MCP token and one-click starts for the two chat assistants most people use. */
export function McpConnect({
  projectId,
  organizationId,
  apiUrl,
  mcpToken,
}: Props) {
  const connectorUrl = mcpToken ? `${apiUrl}/mcp?token=${mcpToken}` : null;

  const connect = (host: (typeof HOSTS)[number]) => {
    if (!connectorUrl) {
      return;
    }
    op.track('onboarding_mcp_connect_clicked', { projectId, host: host.key });
    clipboard(connectorUrl, `Paste it as the MCP server URL (${host.hint})`);
    window.open(host.settingsUrl, '_blank', 'noopener');
  };

  return (
    <section className="col gap-4 rounded-xl border p-5">
      <div className="row items-center gap-2">
        <BotIcon className="text-muted-foreground" size={16} />
        <h2 className="font-semibold text-base">Ask your data in chat</h2>
      </div>
      {mcpToken ? (
        <>
          <p className="text-muted-foreground text-sm">
            Connect ChatGPT or Claude over MCP and ask about this project in
            plain language. Each button copies your connector URL and opens the
            right settings page; paste the URL as a new connector.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {HOSTS.map((host) => (
              <Button
                icon={ExternalLinkIcon}
                key={host.key}
                onClick={() => connect(host)}
                variant="outline"
              >
                {host.label}
              </Button>
            ))}
          </div>
          <CopyInput label="MCP token" value={mcpToken} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          The MCP token was shown once when the project was created. Create
          another MCP client to connect an assistant.
        </p>
      )}
      <Link
        className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
        params={{ organizationId, projectId }}
        to="/$organizationId/$projectId/settings/mcp"
      >
        Cursor, Claude Code, VS Code and more in Settings → MCP
      </Link>
    </section>
  );
}
