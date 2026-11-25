import type { Prisma } from '@openpanel/db';
import { getSuperJson, setSuperJson } from '@openpanel/shared';
import { getRedisPub, getRedisSub, type Redis } from './redis';

export type IPublishChannels = {
  organization: {
    subscription_updated: {
      organizationId: string;
    };
  };
  events: {
    batch: { projectId: string; count: number };
  };
  notification: {
    created: Prisma.NotificationUncheckedCreateInput;
  };
};

export function getSubscribeChannel<Channel extends keyof IPublishChannels>(
  channel: Channel,
  type: keyof IPublishChannels[Channel]
) {
  return `${channel}:${String(type)}`;
}

export function publishEvent<Channel extends keyof IPublishChannels>(
  channel: Channel,
  type: keyof IPublishChannels[Channel],
  event: IPublishChannels[Channel][typeof type],
  multi?: ReturnType<Redis['multi']>
) {
  const redis = multi ?? getRedisPub();
  return redis.publish(getSubscribeChannel(channel, type), setSuperJson(event));
}

export function parsePublishedEvent<Channel extends keyof IPublishChannels>(
  _channel: Channel,
  _type: keyof IPublishChannels[Channel],
  message: string
): IPublishChannels[Channel][typeof _type] {
  return getSuperJson<IPublishChannels[Channel][typeof _type]>(message)!;
}

type ChannelMessageListener = (message: string) => void;

/**
 * Every subscriber in the process shares ONE ioredis connection (`getRedisSub`,
 * a module-level singleton). SUBSCRIBE and UNSUBSCRIBE on it are process-wide,
 * so a per-subscriber UNSUBSCRIBE silences every other subscriber on that
 * channel: closing one `/live` socket left every other open socket receiving
 * nothing for 30 s, across routes and across projects, because
 * `/live/events` and `/live/visitors` both ride `events:batch`.
 *
 * So the channel is reference-counted here rather than at each call site: the
 * wire SUBSCRIBE happens only on 0 -> 1 and the wire UNSUBSCRIBE only on 1 ->
 * 0. One `message` handler is installed on the shared connection for the whole
 * process and dispatches by channel name, which also keeps the connection off
 * Node's max-listeners warning as sockets accumulate.
 *
 * RECONNECT NEEDS NO HANDLING HERE: ioredis re-issues SUBSCRIBE for every channel it holds (`autoResubscribe`,
 * default true), and the wire commands stay one-to-one with the 0 -> 1 and 1 -> 0 edges.
 */
const listenersByChannel = new Map<string, Set<ChannelMessageListener>>();

let isDispatcherInstalled = false;

// Deleting a not-yet-visited entry mid-iteration skips it, which is what an
// unsubscribe from inside a callback should do.
function dispatchToChannelListeners(channel: string, message: string) {
  const listeners = listenersByChannel.get(channel);
  if (!listeners) {
    return;
  }
  for (const listener of listeners) {
    listener(message);
  }
}

function installDispatcherOnce() {
  if (isDispatcherInstalled) {
    return;
  }
  isDispatcherInstalled = true;
  getRedisSub().on('message', dispatchToChannelListeners);
}

function addChannelListener(channel: string, listener: ChannelMessageListener) {
  installDispatcherOnce();
  const listeners = listenersByChannel.get(channel);
  if (listeners) {
    listeners.add(listener);
    return;
  }

  listenersByChannel.set(channel, new Set([listener]));
  getRedisSub().subscribe(channel);
}

function removeChannelListener(
  channel: string,
  listener: ChannelMessageListener
) {
  const listeners = listenersByChannel.get(channel);
  if (!listeners?.delete(listener)) {
    return;
  }
  if (listeners.size > 0) {
    return;
  }

  listenersByChannel.delete(channel);
  getRedisSub().unsubscribe(channel);
}

export function subscribeToPublishedEvent<
  Channel extends keyof IPublishChannels,
>(
  channel: Channel,
  type: keyof IPublishChannels[Channel],
  callback: (event: IPublishChannels[Channel][typeof type]) => void
) {
  const subscribeChannel = getSubscribeChannel(channel, type);

  const listener: ChannelMessageListener = (message) => {
    const event = parsePublishedEvent(channel, type, message);
    if (event) {
      callback(event);
    }
  };

  addChannelListener(subscribeChannel, listener);

  let isReleased = false;
  return () => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    removeChannelListener(subscribeChannel, listener);
  };
}

export function psubscribeToPublishedEvent(
  pattern: string,
  callback: (key: string) => void
) {
  getRedisSub().psubscribe(pattern);
  const pmessage = (_: unknown, pattern: string, key: string) => callback(key);

  getRedisSub().on('pmessage', pmessage);

  return () => {
    getRedisSub().punsubscribe(pattern);
    getRedisSub().off('pmessage', pmessage);
  };
}
