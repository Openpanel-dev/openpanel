/**
 * One subscriber leaving must not silence the others.
 *
 * `subscribeToPublishedEvent` hands every caller the SAME ioredis connection
 * (`getRedisSub`, a process-wide singleton), so the unsubscribe it returns
 * must not take the channel away from the whole process — on the `/live`
 * sockets, closing one used to leave every other open socket receiving
 * nothing for 30s. What is pinned here is the reference count — and, just as
 * important, that the LAST listener leaving still sends a real UNSUBSCRIBE,
 * so the fix cannot degrade into "never unsubscribe".
 *
 * No real Redis: a stand-in for the shared connection that records the wire
 * commands and can push a `message` event, which is the entire surface the
 * publisher uses.
 */

import { setSuperJson } from '@openpanel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EVENTS_CHANNEL = 'events:batch';
const ORGANIZATION_CHANNEL = 'organization:subscription_updated';

const redisSub = vi.hoisted(() => {
  const messageHandlers: Array<(channel: string, message: string) => void> = [];
  const commands: string[] = [];

  return {
    commands,
    messageHandlerCount: () => messageHandlers.length,
    emit(channel: string, message: string) {
      for (const handler of [...messageHandlers]) {
        handler(channel, message);
      }
    },
    on(event: string, handler: (channel: string, message: string) => void) {
      if (event === 'message') {
        messageHandlers.push(handler);
      }
      return redisSub;
    },
    off(event: string, handler: (channel: string, message: string) => void) {
      if (event === 'message') {
        const index = messageHandlers.indexOf(handler);
        if (index !== -1) {
          messageHandlers.splice(index, 1);
        }
      }
      return redisSub;
    },
    subscribe(channel: string) {
      commands.push(`subscribe ${channel}`);
      return Promise.resolve(1);
    },
    unsubscribe(channel: string) {
      commands.push(`unsubscribe ${channel}`);
      return Promise.resolve(0);
    },
  };
});

vi.mock('./redis', () => ({
  getRedisPub: () => redisSub,
  getRedisSub: () => redisSub,
}));

const { subscribeToPublishedEvent } = await import('./publisher');

const publishBatch = (projectId: string, count: number) =>
  redisSub.emit(EVENTS_CHANNEL, setSuperJson({ projectId, count }));

beforeEach(() => {
  redisSub.commands.length = 0;
});

describe('subscribeToPublishedEvent reference counting', () => {
  it('keeps delivering to the survivors when one listener drops', () => {
    const survivor = vi.fn();
    const leaver = vi.fn();

    const unsubscribeSurvivor = subscribeToPublishedEvent(
      'events',
      'batch',
      survivor
    );
    const unsubscribeLeaver = subscribeToPublishedEvent(
      'events',
      'batch',
      leaver
    );

    unsubscribeLeaver();
    publishBatch('project-a', 3);

    expect(survivor).toHaveBeenCalledWith({ projectId: 'project-a', count: 3 });
    expect(leaver).not.toHaveBeenCalled();
    expect(redisSub.commands).not.toContain(`unsubscribe ${EVENTS_CHANNEL}`);

    unsubscribeSurvivor();
  });

  it('sends a real UNSUBSCRIBE when the last listener leaves', () => {
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = subscribeToPublishedEvent(
      'events',
      'batch',
      first
    );
    const unsubscribeSecond = subscribeToPublishedEvent(
      'events',
      'batch',
      second
    );

    unsubscribeFirst();
    expect(redisSub.commands).not.toContain(`unsubscribe ${EVENTS_CHANNEL}`);

    unsubscribeSecond();
    expect(redisSub.commands).toContain(`unsubscribe ${EVENTS_CHANNEL}`);

    publishBatch('project-a', 1);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('does not re-SUBSCRIBE when a listener joins a channel that has one', () => {
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = subscribeToPublishedEvent(
      'events',
      'batch',
      first
    );
    expect(redisSub.commands).toEqual([`subscribe ${EVENTS_CHANNEL}`]);

    const unsubscribeSecond = subscribeToPublishedEvent(
      'events',
      'batch',
      second
    );
    expect(redisSub.commands).toEqual([`subscribe ${EVENTS_CHANNEL}`]);

    publishBatch('project-a', 7);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    unsubscribeSecond();
  });

  it('installs exactly one message handler on the shared connection', () => {
    const before = redisSub.messageHandlerCount();
    const unsubscribers = [
      subscribeToPublishedEvent('events', 'batch', vi.fn()),
      subscribeToPublishedEvent('events', 'batch', vi.fn()),
      subscribeToPublishedEvent(
        'organization',
        'subscription_updated',
        vi.fn()
      ),
    ];

    expect(redisSub.messageHandlerCount()).toBe(before);

    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  });
});

describe('subscribeToPublishedEvent unsubscribe idempotence', () => {
  it('is safe to call twice and decrements at most once', () => {
    const survivor = vi.fn();
    const leaver = vi.fn();

    const unsubscribeSurvivor = subscribeToPublishedEvent(
      'events',
      'batch',
      survivor
    );
    const unsubscribeLeaver = subscribeToPublishedEvent(
      'events',
      'batch',
      leaver
    );

    unsubscribeLeaver();
    unsubscribeLeaver();
    unsubscribeLeaver();

    expect(redisSub.commands).not.toContain(`unsubscribe ${EVENTS_CHANNEL}`);

    publishBatch('project-a', 2);
    expect(survivor).toHaveBeenCalledTimes(1);

    // The count reached zero exactly once, so the survivor leaving still tears
    // the channel down rather than leaving it dangling at a negative count.
    unsubscribeSurvivor();
    expect(redisSub.commands).toContain(`unsubscribe ${EVENTS_CHANNEL}`);
  });
});

describe('subscribeToPublishedEvent channel isolation', () => {
  it('keeps listeners on different channels independent', () => {
    const onBatch = vi.fn();
    const onOrganization = vi.fn();

    const unsubscribeBatch = subscribeToPublishedEvent(
      'events',
      'batch',
      onBatch
    );
    const unsubscribeOrganization = subscribeToPublishedEvent(
      'organization',
      'subscription_updated',
      onOrganization
    );

    expect(redisSub.commands).toEqual([
      `subscribe ${EVENTS_CHANNEL}`,
      `subscribe ${ORGANIZATION_CHANNEL}`,
    ]);

    unsubscribeOrganization();
    expect(redisSub.commands).toContain(`unsubscribe ${ORGANIZATION_CHANNEL}`);
    expect(redisSub.commands).not.toContain(`unsubscribe ${EVENTS_CHANNEL}`);

    publishBatch('project-a', 5);
    redisSub.emit(
      ORGANIZATION_CHANNEL,
      setSuperJson({ organizationId: 'org-1' })
    );

    expect(onBatch).toHaveBeenCalledWith({ projectId: 'project-a', count: 5 });
    expect(onOrganization).not.toHaveBeenCalled();

    unsubscribeBatch();
  });
});
