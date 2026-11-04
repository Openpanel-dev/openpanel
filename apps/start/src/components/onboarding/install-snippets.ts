import type { Framework } from '@openpanel/sdk-info';

export interface SnippetContext {
  clientId: string;
  /** Known only in the browser session that created the client. */
  clientSecret: string | null;
  /** Set on self-hosted installs so snippets point at the right API. */
  apiUrl: string | null;
}

export interface InstallSnippet {
  title: string;
  code: string;
  language: 'bash' | 'typescript' | 'json' | 'markdown';
}

const SECRET_PLACEHOLDER = 'YOUR_CLIENT_SECRET';
export const SCRIPT_URL = 'https://openpanel.dev/op1.js';

const secretOf = (context: SnippetContext) =>
  context.clientSecret ?? SECRET_PLACEHOLDER;

const apiUrlLine = (context: SnippetContext, indent: string) =>
  context.apiUrl ? `\n${indent}apiUrl: '${context.apiUrl}',` : '';

export function scriptTagSnippet(context: SnippetContext): string {
  return `<script>
  window.op=window.op||function(){var n=[];return new Proxy(function(){arguments.length&&n.push([].slice.call(arguments))},{get:function(t,r){return"q"===r?n:function(){n.push([r].concat([].slice.call(arguments)))}} ,has:function(t,r){return"q"===r}}) }();
  window.op('init', {${apiUrlLine(context, '    ')}
    clientId: '${context.clientId}',
    trackScreenViews: true,
    trackOutgoingLinks: true,
    trackAttributes: true,
  });
</script>
<script src="${SCRIPT_URL}" defer async></script>`;
}

function webSdkSnippets(context: SnippetContext): InstallSnippet[] {
  return [
    { title: 'Install', code: 'npm install @openpanel/web', language: 'bash' },
    {
      title: 'Create one shared instance',
      language: 'typescript',
      code: `// src/openpanel.ts
import { OpenPanel } from '@openpanel/web';

export const op = new OpenPanel({${apiUrlLine(context, '  ')}
  clientId: '${context.clientId}',
  trackScreenViews: true,
  trackOutgoingLinks: true,
  trackAttributes: true,
});`,
    },
  ];
}

function serverSdkSnippets(context: SnippetContext): InstallSnippet[] {
  return [
    { title: 'Install', code: 'npm install @openpanel/sdk', language: 'bash' },
    {
      title: 'Initialize',
      language: 'typescript',
      code: `import { OpenPanel } from '@openpanel/sdk';

const op = new OpenPanel({${apiUrlLine(context, '  ')}
  clientId: '${context.clientId}',
  clientSecret: '${secretOf(context)}',
});

op.track('my_event', { foo: 'bar' });`,
    },
  ];
}

const trackUrl = (context: SnippetContext) =>
  `${context.apiUrl ?? 'https://api.openpanel.dev'}/track`;

export function curlSnippet(context: SnippetContext, eventName: string) {
  return `curl -X POST ${trackUrl(context)} \\
  -H "Content-Type: application/json" \\
  -H "openpanel-client-id: ${context.clientId}" \\
  -H "openpanel-client-secret: ${secretOf(context)}" \\
  -d '{"type":"track","payload":{"name":"${eventName}","properties":{"source":"curl"}}}'`;
}

const SNIPPETS: Record<string, (context: SnippetContext) => InstallSnippet[]> =
  {
    html: (context) => [
      {
        title: 'Paste before </head> on every page',
        code: scriptTagSnippet(context),
        language: 'markdown',
      },
    ],
    react: webSdkSnippets,
    vue: webSdkSnippets,
    remix: webSdkSnippets,
    nextjs: (context) => [
      {
        title: 'Install',
        code: 'npm install @openpanel/nextjs',
        language: 'bash',
      },
      {
        title: 'Add to your root layout',
        language: 'typescript',
        code: `// app/layout.tsx
import { OpenPanelComponent } from '@openpanel/nextjs';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <OpenPanelComponent${context.apiUrl ? `\n          apiUrl="${context.apiUrl}"` : ''}
          clientId="${context.clientId}"
          trackScreenViews={true}
          trackOutgoingLinks={true}
          trackAttributes={true}
        />
        {children}
      </body>
    </html>
  );
}`,
      },
    ],
    nuxt: (context) => [
      {
        title: 'Install',
        code: 'npm install @openpanel/nuxt',
        language: 'bash',
      },
      {
        title: 'Register the module',
        language: 'typescript',
        code: `// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@openpanel/nuxt'],
  openpanel: {${apiUrlLine(context, '    ')}
    clientId: '${context.clientId}',
    trackScreenViews: true,
    trackOutgoingLinks: true,
    trackAttributes: true,
  },
});`,
      },
    ],
    astro: (context) => [
      {
        title: 'Install',
        code: 'npm install @openpanel/astro',
        language: 'bash',
      },
      {
        title: 'Add to your layout <head>',
        language: 'markdown',
        code: `---
import { OpenPanelComponent } from '@openpanel/astro';
---
<html>
  <head>
    <OpenPanelComponent${context.apiUrl ? `\n      apiUrl="${context.apiUrl}"` : ''}
      clientId="${context.clientId}"
      trackScreenViews={true}
      trackOutgoingLinks={true}
      trackAttributes={true}
    />
  </head>
  <body>
    <slot />
  </body>
</html>`,
      },
    ],
    rest: (context) => [
      {
        title: 'Send an event over HTTP',
        code: curlSnippet(context, 'my_event'),
        language: 'bash',
      },
    ],
    'react-native': (context) => [
      {
        title: 'Install',
        code: `npm install @openpanel/react-native
npx expo install expo-application expo-constants`,
        language: 'bash',
      },
      {
        title: 'Initialize',
        language: 'typescript',
        code: `import { OpenPanel } from '@openpanel/react-native';

export const op = new OpenPanel({${apiUrlLine(context, '  ')}
  clientId: '${context.clientId}',
  clientSecret: '${secretOf(context)}',
});`,
      },
    ],
    node: serverSdkSnippets,
    express: (context) => [
      {
        title: 'Install',
        code: 'npm install @openpanel/express',
        language: 'bash',
      },
      {
        title: 'Add the middleware',
        language: 'typescript',
        code: `import express from 'express';
import createOpenpanelMiddleware from '@openpanel/express';

const app = express();

app.use(
  createOpenpanelMiddleware({${apiUrlLine(context, '    ')}
    clientId: '${context.clientId}',
    clientSecret: '${secretOf(context)}',
  })
);

app.post('/sign-up', (req, res) => {
  req.op.track('sign_up', { email: req.body.email });
  res.send('ok');
});`,
      },
    ],
    python: (context) => [
      { title: 'Install', code: 'pip install openpanel', language: 'bash' },
      {
        title: 'Initialize',
        language: 'typescript',
        code: `from openpanel import OpenPanel

op = OpenPanel(${context.apiUrl ? `\n    api_url="${context.apiUrl}",` : ''}
    client_id="${context.clientId}",
    client_secret="${secretOf(context)}",
)

op.track("my_event", {"foo": "bar"})`,
      },
    ],
    rust: (context) => [
      { title: 'Install', code: 'cargo add openpanel-sdk', language: 'bash' },
      {
        title: 'Environment variables',
        language: 'bash',
        code: `OPENPANEL_TRACK_URL=${trackUrl(context)}
OPENPANEL_CLIENT_ID=${context.clientId}
OPENPANEL_CLIENT_SECRET=${secretOf(context)}`,
      },
      {
        title: 'Initialize',
        language: 'typescript',
        code: `use openpanel_sdk::sdk::Tracker;

let tracker = Tracker::try_new_from_env()?.with_default_headers()?;`,
      },
    ],
    ruby: (context) => [
      { title: 'Install', code: 'bundle add openpanel-sdk', language: 'bash' },
      {
        title: 'Environment variables',
        language: 'bash',
        code: `OPENPANEL_TRACK_URL=${trackUrl(context)}
OPENPANEL_CLIENT_ID=${context.clientId}
OPENPANEL_CLIENT_SECRET=${secretOf(context)}`,
      },
      {
        title: 'Initialize',
        language: 'typescript',
        code: `require 'openpanel-sdk'

tracker = OpenPanel::SDK::Tracker.new
tracker.track('my_event', { foo: 'bar' })`,
      },
    ],
    ios: (context) => [
      {
        title: 'Add the Swift package',
        code: 'https://github.com/Openpanel-dev/swift-sdk',
        language: 'bash',
      },
      {
        title: 'Initialize',
        language: 'typescript',
        code: `import OpenPanel

OpenPanel.initialize(options: .init(${context.apiUrl ? `\n    apiUrl: "${context.apiUrl}",` : ''}
    clientId: "${context.clientId}",
    clientSecret: "${secretOf(context)}"
))`,
      },
    ],
    android: (context) => [
      {
        title: 'Add the dependency',
        code: `dependencies {
    implementation 'dev.openpanel:openpanel:0.0.1'
}`,
        language: 'bash',
      },
      {
        title: 'Initialize',
        language: 'typescript',
        code: `val op = OpenPanel.create(
    context,
    OpenPanel.Options(${context.apiUrl ? `\n        apiUrl = "${context.apiUrl}",` : ''}
        clientId = "${context.clientId}",
        clientSecret = "${secretOf(context)}"
    )
)`,
      },
    ],
  };

/** Frameworks without an inline snippet (community SDKs) only link to their guide. */
export function getInstallSnippets(
  framework: Framework,
  context: SnippetContext
): InstallSnippet[] {
  return SNIPPETS[framework.key]?.(context) ?? [];
}

export function usesClientSecret(framework: Framework): boolean {
  return !framework.type.includes('website') || framework.key === 'rest';
}
