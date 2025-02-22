import { type Redis, getRedisPub, getRedisSub } from './redis';

import type { IServiceEvent, Notification } from '@openpanel/db';
import { getSuperJson, setSuperJson } from '@openpanel/json';

export type IPublishChannels = {
  organization: {
    subscription_updated: {
      organizationId: string;
    };
  };
  events: {
    received: IServiceEvent;
    saved: IServiceEvent;
  };
  notification: {
    created: Notification;
  };
};

export function getSubscribeChannel<Channel extends keyof IPublishChannels>(
  channel: Channel,
  type: keyof IPublishChannels[Channel],
) {
  return `${channel}:${String(type)}`;
}

export function publishEvent<Channel extends keyof IPublishChannels>(
  channel: Channel,
  type: keyof IPublishChannels[Channel],
  event: IPublishChannels[Channel][typeof type],
  multi?: ReturnType<Redis['multi']>,
) {
  const redis = multi ?? getRedisPub();
  return redis.publish(getSubscribeChannel(channel, type), setSuperJson(event));
}

export function parsePublishedEvent<Channel extends keyof IPublishChannels>(
  _channel: Channel,
  _type: keyof IPublishChannels[Channel],
  message: string,
): IPublishChannels[Channel][typeof _type] {
  return getSuperJson<IPublishChannels[Channel][typeof _type]>(message)!;
}

export function subscribeToPublishedEvent<
  Channel extends keyof IPublishChannels,
>(
  channel: Channel,
  type: keyof IPublishChannels[Channel],
  callback: (event: IPublishChannels[Channel][typeof type]) => void,
) {
  const subscribeChannel = getSubscribeChannel(channel, type);
  getRedisSub().subscribe(subscribeChannel);

  const message = (messageChannel: string, message: string) => {
    if (subscribeChannel === messageChannel) {
      const event = parsePublishedEvent(channel, type, message);
      if (event) {
        callback(event);
      }
    }
  };

  getRedisSub().on('message', message);

  return () => {
    getRedisSub().unsubscribe(subscribeChannel);
    getRedisSub().off('message', message);
  };
}

export function psubscribeToPublishedEvent(
  pattern: string,
  callback: (key: string) => void,
) {
  getRedisSub().psubscribe(pattern);
  const pmessage = (_: unknown, pattern: string, key: string) => callback(key);

  getRedisSub().on('pmessage', pmessage);

  return () => {
    getRedisSub().punsubscribe(pattern);
    getRedisSub().off('pmessage', pmessage);
  };
}
