import type { IAiFilters } from '@openpanel/core/modules/ai/ai.constants';
import { useMatches, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

const AI_TABS_ROUTE = '/_app/$organizationId/$projectId/ai/_tabs';

/** The pages that share the filters; a change stays on the one that made it. */
const AI_PAGE_PATHS = [
  '/$organizationId/$projectId/ai/',
  '/$organizationId/$projectId/ai/traces',
  '/$organizationId/$projectId/ai/generations',
] as const;
type AiPagePath = (typeof AI_PAGE_PATHS)[number];

function isAiPagePath(path: string): path is AiPagePath {
  return (AI_PAGE_PATHS as readonly string[]).includes(path);
}

/** The filter state the AI pages keep in the URL, declared so links can set it. */
export const zAiSearch = z.object({
  models: z.array(z.string()).optional(),
  providers: z.array(z.string()).optional(),
  names: z.array(z.string()).optional(),
  errors: z.boolean().optional(),
  q: z.string().optional(),
  profile: z.string().optional(),
  group: z.string().optional(),
  conversation: z.string().optional(),
  session: z.string().optional(),
});

export type AiSearch = z.infer<typeof zAiSearch>;

/** `null` clears a key, as the URL has no way to carry it. */
type AiSearchUpdate = { [K in keyof AiSearch]?: AiSearch[K] | null };

const EMPTY_SEARCH: AiSearchUpdate = {
  models: null,
  providers: null,
  names: null,
  errors: null,
  q: null,
  profile: null,
  group: null,
  conversation: null,
  session: null,
};

function applyUpdate(previous: AiSearch, update: AiSearchUpdate): AiSearch {
  const next: Record<string, unknown> = { ...previous };
  for (const [key, value] of Object.entries(update)) {
    if (value === null || value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next as AiSearch;
}

/** The AI pages' filters, kept in the URL so a filtered view is a link. */
export function useAiFilters() {
  const state = useSearch({ from: AI_TABS_ROUTE });
  // The deepest match is the page itself; the hook's caller may sit in the
  // tabs layout above it.
  const currentPath = useMatches({
    select: (matches) => matches.at(-1)?.fullPath,
  });
  const navigate = useNavigate();

  const setState = useCallback(
    (update: AiSearchUpdate) => {
      if (!(currentPath && isAiPagePath(currentPath))) {
        return;
      }
      navigate({
        from: currentPath,
        search: (previous) => applyUpdate(previous, update),
      });
    },
    [navigate, currentPath]
  );

  const filters = useMemo<IAiFilters>(
    () => ({
      models: state.models,
      providers: state.providers,
      names: state.names,
      isError: state.errors ? true : undefined,
      search: state.q,
      profileId: state.profile,
      groupId: state.group,
      conversationId: state.conversation,
      sessionId: state.session,
    }),
    [state]
  );

  const activeCount = Object.values(filters).filter(
    (value) =>
      value !== undefined && (!Array.isArray(value) || value.length > 0)
  ).length;

  return {
    state,
    filters,
    activeCount,
    setState,
    clear: () => setState(EMPTY_SEARCH),
  };
}
