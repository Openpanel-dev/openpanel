import { parseAsIsoDateTime, parseAsString, useQueryStates } from 'nuqs';
import { useCallback } from 'react';

const parsers = {
  event: parseAsString,
  eventAt: parseAsIsoDateTime,
  chat: parseAsString,
};

export interface OpenEventInput {
  id: string;
  /** Narrows the ClickHouse lookup to the event's partition. */
  createdAt?: Date | string;
}

/**
 * `?event=<id>` is the single source of truth for the event details drawer,
 * the same way `?chat` is for the chat drawer. Both drawers share the right
 * edge, so opening an event closes the chat; the drawer itself closes when
 * the chat opens on top of it.
 */
export function useEventDrawer() {
  const [state, setState] = useQueryStates(parsers, { history: 'push' });

  const openEvent = useCallback(
    ({ id, createdAt }: OpenEventInput) =>
      setState({
        event: id,
        eventAt: createdAt ? new Date(createdAt) : null,
        chat: null,
      }),
    [setState]
  );

  const closeEvent = useCallback(
    (options?: { history: 'push' | 'replace' }) =>
      setState({ event: null, eventAt: null }, options),
    [setState]
  );

  return {
    eventId: state.event,
    createdAt: state.eventAt ?? undefined,
    chatId: state.chat,
    isOpen: state.event !== null,
    openEvent,
    closeEvent,
  };
}
