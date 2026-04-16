import { parseAsString, useQueryState } from 'nuqs';

/**
 * The `?chat` URL param is the single source of truth for the chat
 * drawer. Possible states:
 *   - param absent (null) → drawer closed
 *   - param is a string   → drawer open, the value is the active
 *                           conversation id
 *
 * Opening a brand-new conversation = push a freshly generated UUID.
 * Switching to an existing conversation = push its id. Closing =
 * clear the param.
 *
 * This makes conversations linkable (paste a URL, land on that chat)
 * and keeps chat state in the browser history.
 */
export function useChatUrlState() {
  return useQueryState(
    'chat',
    parseAsString.withOptions({ history: 'push' }),
  );
}

/**
 * Generate a new conversation id. Browser-native UUID when available,
 * fallback to a timestamp+random combo for very old browsers.
 */
export function newConversationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
