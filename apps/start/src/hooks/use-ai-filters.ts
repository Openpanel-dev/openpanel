import type { IAiFilters } from '@openpanel/core/modules/ai/ai.constants';
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  useQueryStates,
} from 'nuqs';
import { useMemo } from 'react';

const parsers = {
  models: parseAsArrayOf(parseAsString),
  providers: parseAsArrayOf(parseAsString),
  names: parseAsArrayOf(parseAsString),
  errors: parseAsBoolean,
  q: parseAsString,
  profile: parseAsString,
  group: parseAsString,
  conversation: parseAsString,
  session: parseAsString,
};

/** The AI pages' filters, kept in the URL so a filtered view is a link. */
export function useAiFilters() {
  const [state, setState] = useQueryStates(parsers, { history: 'push' });

  const filters = useMemo<IAiFilters>(
    () => ({
      models: state.models ?? undefined,
      providers: state.providers ?? undefined,
      names: state.names ?? undefined,
      isError: state.errors ? true : undefined,
      search: state.q ?? undefined,
      profileId: state.profile ?? undefined,
      groupId: state.group ?? undefined,
      conversationId: state.conversation ?? undefined,
      sessionId: state.session ?? undefined,
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
    clear: () =>
      setState({
        models: null,
        providers: null,
        names: null,
        errors: null,
        q: null,
        profile: null,
        group: null,
        conversation: null,
        session: null,
      }),
  };
}
