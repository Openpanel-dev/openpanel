import type { AppClient } from '@/agents/client';

/**
 * Stream a conversation title from the backend `__titler` agent.
 *
 * Calls `onDelta(fullText)` after every text event so the caller can
 * render the title as it's generated. Returns the final accumulated
 * title string (trimmed), or null if nothing useful was produced.
 *
 * Pass an `AbortSignal` to cancel an in-flight stream (e.g. when the
 * user switches or closes the conversation before the title finishes).
 * Once aborted the function returns null and stops calling `onDelta`.
 *
 * Fails silently — titles are non-critical; the header just falls
 * back to "Untitled chat" or the persisted DB value.
 */
export async function streamTitle(
  client: AppClient,
  firstUserText: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  const trimmed = firstUserText.trim().slice(0, 400);
  if (!trimmed) return null;
  if (signal?.aborted) return null;

  let accumulated = '';
  try {
    const iterable = client.stream('__titler', {
      input: `Generate a 3-5 word title for a chat that started with: "${trimmed}"`,
      // biome-ignore lint/suspicious/noExplicitAny: titler agent has no typed context; its run-input shape is generic
    } as any);
    for await (const event of iterable) {
      if (signal?.aborted) return null;
      // Better Agent emits `TEXT_MESSAGE_CONTENT` with a `delta` field
      // for each streamed chunk of assistant text.
      const maybe = event as { type?: string; delta?: string };
      if (maybe.type === 'TEXT_MESSAGE_CONTENT' && typeof maybe.delta === 'string') {
        accumulated += maybe.delta;
        onDelta(accumulated.trim().slice(0, 80));
      }
    }
    if (signal?.aborted) return null;
    return accumulated.trim().slice(0, 80) || null;
  } catch (err) {
    console.error('[chat] title stream failed', err);
    return null;
  }
}
