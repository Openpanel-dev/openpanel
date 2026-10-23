import type { Framework } from '@openpanel/sdk-info';
import {
  curlSnippet,
  type SnippetContext,
  scriptTagSnippet,
  usesClientSecret,
} from './install-snippets';

const DOCS_INDEX_URL = 'https://openpanel.dev/llms.txt';
const SDK_OVERVIEW_URL = 'https://openpanel.dev/docs/sdks';
const TRACK_API_URL = 'https://openpanel.dev/docs/api/track';
export const CURSOR_PROMPT_DEEPLINK =
  'cursor://anysphere.cursor-deeplink/prompt?text=';

export interface AiPromptInput {
  projectName: string;
  projectTypes: ('website' | 'app' | 'backend')[];
  /** Null means "let the agent detect the framework". */
  framework: Framework | null;
  context: SnippetContext;
}

const TYPE_LABELS: Record<AiPromptInput['projectTypes'][number], string> = {
  website: 'a website',
  app: 'a mobile app',
  backend: 'a backend service',
};

function describeTarget(input: AiPromptInput): string {
  const types = input.projectTypes.map((type) => TYPE_LABELS[type]);
  const target = types.length > 0 ? types.join(' and ') : 'an application';
  return input.framework
    ? `${target} built with ${input.framework.name}`
    : target;
}

function guideLines(input: AiPromptInput): string[] {
  if (input.framework) {
    return [
      `Follow the ${input.framework.name} guide: ${input.framework.href}`,
      `The full documentation index is at ${DOCS_INDEX_URL} if you need anything else.`,
    ];
  }
  return [
    `Detect the framework from this repository, then follow the matching guide from ${SDK_OVERVIEW_URL} (documentation index: ${DOCS_INDEX_URL}).`,
    `If no SDK matches, use the script tag below on a website, or the HTTP API (${TRACK_API_URL}) anywhere else.`,
  ];
}

function credentialLines(input: AiPromptInput): string[] {
  const lines = [`Client ID: ${input.context.clientId}`];
  const needsSecret = input.framework
    ? usesClientSecret(input.framework)
    : !input.projectTypes.includes('website') || input.projectTypes.length > 1;
  if (needsSecret) {
    lines.push(
      `Client secret: ${input.context.clientSecret ?? 'ask me for it, it is not in this prompt'}`,
      'The secret is only for server or native code. Read both values from environment variables (OPENPANEL_CLIENT_ID, OPENPANEL_CLIENT_SECRET) and never commit the secret or ship it to a browser.'
    );
  }
  if (input.context.apiUrl) {
    lines.push(
      `This is a self-hosted instance. Point the SDK at the API URL ${input.context.apiUrl} (the "apiUrl" option).`
    );
  }
  return lines;
}

function fallbackSnippet(input: AiPromptInput): string[] {
  const isWebsiteOnly =
    input.projectTypes.length === 1 && input.projectTypes[0] === 'website';
  if (input.framework || !isWebsiteOnly) {
    if (input.framework) {
      return [];
    }
    return ['', 'HTTP API example:', curlSnippet(input.context, 'my_event')];
  }
  return ['', 'Script tag fallback:', scriptTagSnippet(input.context)];
}

export function buildAiInstallPrompt(input: AiPromptInput): string {
  const lines = [
    `Install OpenPanel analytics in this project. It is ${describeTarget(input)}, tracked in the OpenPanel project "${input.projectName}".`,
    '',
    ...guideLines(input),
    '',
    ...credentialLines(input),
    '',
    'What to do:',
    '1. Install the SDK with the package manager this repository already uses.',
    '2. Initialize it once, where the app starts, with the credentials above. Keep automatic screen view tracking on; do not add custom events yet.',
    '3. Run the app (or send one request) so at least one event reaches OpenPanel, then tell me what you changed. The OpenPanel dashboard is open and waiting for the first event.',
    ...fallbackSnippet(input),
  ];
  return lines.join('\n');
}
