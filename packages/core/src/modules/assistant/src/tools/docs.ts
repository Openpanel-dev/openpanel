import { tool } from 'ai';
import { z } from 'zod';
import type { ChatToolContext } from '../context';

/** The public docs rendered for LLMs, one section per page. */
const DOCS_URL = 'https://openpanel.dev/llms-full.txt';
const DOCS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DOCS_FETCH_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 3;
const MAX_SECTION_CHARS = 3500;
const MIN_TERM_LENGTH = 3;
const TITLE_WEIGHT = 6;
const MAX_BODY_HITS = 12;
const SECTION_SEPARATOR = /\n---\n/;
const TITLE_LINE = /^## (.+)$/m;
const URL_LINE = /^URL: (\S+)$/m;
const NON_WORD = /[^a-z0-9]+/;
/** Pages that only make sense when you run OpenPanel yourself. */
const SELF_HOSTING_DOCS = '/docs/self-hosting';

interface DocSection {
  title: string;
  url: string;
  body: string;
  lowerTitle: string;
  lowerBody: string;
}

let cached: { fetchedAt: number; sections: DocSection[] } | null = null;

function parseSections(text: string): DocSection[] {
  const sections: DocSection[] = [];
  for (const chunk of text.split(SECTION_SEPARATOR)) {
    const title = TITLE_LINE.exec(chunk)?.[1]?.trim();
    const url = URL_LINE.exec(chunk)?.[1]?.trim();
    if (!(title && url)) {
      continue;
    }
    const body = chunk.replace(TITLE_LINE, '').replace(URL_LINE, '').trim();
    sections.push({
      title,
      url,
      body,
      lowerTitle: title.toLowerCase(),
      lowerBody: body.toLowerCase(),
    });
  }
  return sections;
}

async function loadSections(): Promise<DocSection[]> {
  if (cached && Date.now() - cached.fetchedAt < DOCS_CACHE_TTL_MS) {
    return cached.sections;
  }
  const response = await fetch(DOCS_URL, {
    signal: AbortSignal.timeout(DOCS_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Docs fetch failed with ${response.status}`);
  }
  const sections = parseSections(await response.text());
  cached = { fetchedAt: Date.now(), sections };
  return sections;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1 && count < MAX_BODY_HITS) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

export function rankSections(
  sections: DocSection[],
  query: string,
  options: { selfHosted: boolean }
) {
  const terms = query
    .toLowerCase()
    .split(NON_WORD)
    .filter((term) => term.length >= MIN_TERM_LENGTH);
  if (terms.length === 0) {
    return [];
  }
  return sections
    .filter(
      (section) =>
        options.selfHosted || !section.url.includes(SELF_HOSTING_DOCS)
    )
    .map((section) => {
      let score = 0;
      for (const term of terms) {
        if (section.lowerTitle.includes(term)) {
          score += TITLE_WEIGHT;
        }
        score += countOccurrences(section.lowerBody, term);
      }
      return { section, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(({ section }) => ({
      title: section.title,
      url: section.url,
      content:
        section.body.length > MAX_SECTION_CHARS
          ? `${section.body.slice(0, MAX_SECTION_CHARS)}…`
          : section.body,
    }));
}

export function docsTools(ctx: Pick<ChatToolContext, 'config'>) {
  return {
    search_docs: tool({
      description:
        'Search the OpenPanel documentation: SDK setup, tracking, identify users, groups, session replay, MCP, API, self-hosting, integrations, pricing concepts. Use it for any "how do I" or "is it possible" question about the product before answering from memory, and link the page you used.',
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async ({ query }) => {
        try {
          const sections = await loadSections();
          return {
            results: rankSections(sections, query, {
              selfHosted: ctx.config.selfHosted,
            }),
          };
        } catch (error) {
          return {
            error: `Documentation is not reachable right now (${error instanceof Error ? error.message : 'unknown error'}). Answer from what you know and point to https://openpanel.dev/docs.`,
          };
        }
      },
    }),
  };
}
