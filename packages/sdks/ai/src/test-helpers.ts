import type { AiPayload } from '@openpanel/sdk';

export interface RecordedRequest {
  url: string;
  body: Record<string, unknown>;
}

export function collect() {
  const payloads: AiPayload[] = [];
  const op = { ai: (payload: AiPayload) => payloads.push(payload) };
  return { op, payloads };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req_1' },
  });
}

/** Server-sent events; `event` lines are included when an event names its type. */
export function sseResponse(
  events: unknown[],
  { named = false, done = false } = {}
): Response {
  const lines = events.map((event) => {
    const type = (event as { type?: string }).type;
    const prefix = named && type ? `event: ${type}\n` : '';
    return `${prefix}data: ${JSON.stringify(event)}\n\n`;
  });
  const text = lines.join('') + (done ? 'data: [DONE]\n\n' : '');
  return new Response(text, {
    headers: { 'content-type': 'text/event-stream' },
  });
}

/** A `fetch` that answers each request with the next queued response. */
export function mockFetch(responses: (() => Response)[]) {
  const requests: RecordedRequest[] = [];
  const queue = [...responses];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    const next = queue.shift();
    if (!next) {
      throw new Error(`unexpected request to ${url}`);
    }
    return next();
  };
  return { fetch, requests };
}
