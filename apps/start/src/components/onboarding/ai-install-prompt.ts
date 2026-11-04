import type { Framework } from '@openpanel/sdk-info';
import {
  curlSnippet,
  getInstallSnippets,
  type SnippetContext,
  scriptTagSnippet,
  usesClientSecret,
} from './install-snippets';

const DOCS_INDEX_URL = 'https://openpanel.dev/llms.txt';
const SDK_OVERVIEW_URL = 'https://openpanel.dev/docs/sdks';
const TRACK_API_URL = 'https://openpanel.dev/docs/api/track';
export const CURSOR_PROMPT_DEEPLINK =
  'cursor://anysphere.cursor-deeplink/prompt?text=';

type ProjectType = 'website' | 'app' | 'backend';

export interface AiPromptInput {
  projectName: string;
  projectTypes: ProjectType[];
  /** Null means "let the agent detect the framework". */
  framework: Framework | null;
  context: SnippetContext;
}

const TYPE_LABELS: Record<ProjectType, string> = {
  website: 'a website',
  app: 'a mobile app',
  backend: 'a backend service',
};

// What to install per platform when the agent has to pick itself. Kept to
// the packages we publish so it cannot invent one.
const PACKAGES_BY_TYPE: Record<ProjectType, string[]> = {
  website: [
    'Next.js: @openpanel/nextjs (render <OpenPanelComponent clientId="…" /> in the root layout)',
    'Nuxt: @openpanel/nuxt (add the module and an `openpanel` block to nuxt.config)',
    'Astro: @openpanel/astro (render <OpenPanelComponent /> in the layout head)',
    'React, Vue, Svelte, Remix or any other browser app: @openpanel/web (one shared `new OpenPanel({ clientId })` instance)',
    'Plain HTML or no build step: the script tag at the end of this prompt',
  ],
  app: [
    'React Native / Expo: @openpanel/react-native plus expo-application and expo-constants',
    'iOS: Swift package https://github.com/Openpanel-dev/swift-sdk',
    'Android: dev.openpanel:openpanel',
  ],
  backend: [
    'Node or Bun: @openpanel/sdk; Express: @openpanel/express (middleware)',
    'Python: pip install openpanel; Ruby: gem openpanel-sdk; Rust: cargo add openpanel-sdk',
    `Anything else: POST to the track API (${TRACK_API_URL})`,
  ],
};

function describeTarget(input: AiPromptInput): string {
  const types = input.projectTypes.map((type) => TYPE_LABELS[type]);
  return types.length > 0 ? types.join(' and ') : 'an application';
}

function needsSecret(input: AiPromptInput): boolean {
  if (input.framework) {
    return usesClientSecret(input.framework);
  }
  return input.projectTypes.some((type) => type !== 'website');
}

function contextLines(input: AiPromptInput): string[] {
  const lines = [
    `- OpenPanel project: "${input.projectName}" (${describeTarget(input)})`,
    `- Client ID: ${input.context.clientId} (public; fine to ship to a browser)`,
  ];
  if (needsSecret(input)) {
    lines.push(
      `- Client secret: ${input.context.clientSecret ?? 'ask me for it before you start'} (server and native code only; read it from an environment variable, never commit it or send it to a browser)`
    );
  }
  if (input.context.apiUrl) {
    lines.push(
      `- API URL: ${input.context.apiUrl} (self-hosted instance; pass it as the \`apiUrl\` option)`
    );
  }
  lines.push(
    input.framework
      ? `- Guide: ${input.framework.href} (every doc: ${DOCS_INDEX_URL})`
      : `- Guides: ${SDK_OVERVIEW_URL} (every doc: ${DOCS_INDEX_URL})`
  );
  return lines;
}

function installSteps(input: AiPromptInput): string[] {
  if (input.framework) {
    const snippets = getInstallSnippets(input.framework, input.context);
    if (snippets.length === 0) {
      return [
        `1. Install the ${input.framework.name} SDK as described in the guide above, using the package manager this repository already uses.`,
        '2. Initialize it once, where the app starts, with the credentials above.',
      ];
    }
    return snippets.map(
      (snippet, index) =>
        `${index + 1}. ${snippet.title}${index === 0 ? ' (use the package manager this repository already uses)' : ''}:\n${indent(snippet.code)}`
    );
  }
  const packages = input.projectTypes.flatMap((type) => PACKAGES_BY_TYPE[type]);
  return [
    '1. Detect the framework from this repository and pick the matching OpenPanel package:',
    ...packages.map((line) => `   - ${line}`),
    '2. Install it with the package manager this repository already uses, then initialize it once, where the app starts, with the credentials above. Follow its guide for the exact code.',
  ];
}

function verificationStep(input: AiPromptInput, number: number): string[] {
  const lines = [
    `${number}. Make one event reach OpenPanel: start the app and open a screen, or send a test request. The OpenPanel dashboard is open and shows the first event as soon as it arrives.`,
  ];
  if (needsSecret(input) && input.context.clientSecret) {
    lines.push(
      '   Test request:',
      indent(curlSnippet(input.context, 'openpanel_test_event'))
    );
  }
  return lines;
}

function indent(code: string): string {
  return code
    .split('\n')
    .map((line) => `   ${line}`)
    .join('\n');
}

function fallbackSnippet(input: AiPromptInput): string[] {
  const includesWebsite = input.projectTypes.includes('website');
  if (input.framework || !includesWebsite) {
    return [];
  }
  return ['', 'Script tag for plain HTML:', scriptTagSnippet(input.context)];
}

export function buildAiInstallPrompt(input: AiPromptInput): string {
  const steps = installSteps(input);
  const nextNumber = input.framework
    ? steps.length + 1
    : steps.filter((line) => /^\d+\. /.test(line)).length + 1;
  return [
    'Set up OpenPanel analytics in this repository.',
    '',
    'Context',
    ...contextLines(input),
    '',
    'Steps',
    ...steps,
    `${nextNumber}. Keep automatic screen view tracking on. Do not add custom events and do not change unrelated files.${needsSecret(input) ? ' The snippet shows the secret inline for clarity; move it to an environment variable before committing.' : ''}`,
    ...verificationStep(input, nextNumber + 1),
    `${nextNumber + 2}. Reply with the files you changed and anything I still have to do (environment variables, restart).`,
    ...fallbackSnippet(input),
  ].join('\n');
}
