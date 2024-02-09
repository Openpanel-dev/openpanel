import { redisSub } from '@mixan/redis';

export async function* redisMessageIterator<T>(opts: {
  transformer: (payload: string) => Promise<T>;
  listenOn: string;
  registerListener: (listener: (...args: any[]) => void) => void;
}) {
  // Subscribe to a channel
  interface Payload {
    data: T;
  }
  // Promise resolver to signal new messages
  let messageNotifier: null | ((payload: Payload) => void) = null;

  // Promise to wait for new messages
  let waitForMessage: Promise<Payload> = new Promise<Payload>((resolve) => {
    messageNotifier = resolve;
  });

  async function listener(pattern: string, channel: string, message: string) {
    const data = await opts.transformer(
      pattern && channel && message ? message : channel
    );

    // Resolve the waiting promise to notify the generator of new message arrival
    if (typeof messageNotifier === 'function') {
      messageNotifier({ data });
    }
    // Clear the notifier to avoid multiple resolutions for a single message
    messageNotifier = null;
  }

  // Event listener for messages on the subscribed channel
  redisSub.on(opts.listenOn, listener);
  opts.registerListener(listener);

  while (true) {
    // Wait for a new message
    const { data } = await waitForMessage;

    // Reset the waiting promise for the next message
    waitForMessage = new Promise((resolve) => {
      messageNotifier = resolve;
    });

    // Yield the received message
    yield { data };
  }
}
