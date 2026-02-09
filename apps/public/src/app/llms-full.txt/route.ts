import {
  OPENPANEL_BASE_URL,
  OPENPANEL_DESCRIPTION,
  OPENPANEL_NAME,
} from '@/lib/openpanel-brand';
import { getLLMText, source } from '@/lib/source';

export const dynamic = 'force-static';

const header = `# ${OPENPANEL_NAME} – Full documentation for LLMs

${OPENPANEL_DESCRIPTION}

This file contains the full text of all documentation pages. Each section is separated by --- and includes a canonical URL.

`;

export async function GET() {
  const pages = source.getPages().slice().sort((a, b) => a.url.localeCompare(b.url));
  const scanned = await Promise.all(pages.map(getLLMText));

  return new Response(header + scanned.join('\n\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
