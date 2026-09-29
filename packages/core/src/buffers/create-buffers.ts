// Built ONCE at boot and hung on `AppDeps.buffers` — never module singletons.

import type { BufferDeps } from './base-buffer';
import { BotBuffer } from './bot-buffer';
import { EventBuffer } from './event-buffer';
import { GroupBuffer } from './group-buffer';
import { ProfileBackfillBuffer } from './profile-backfill-buffer';
import { ProfileBuffer } from './profile-buffer';
import { ReplayBuffer } from './replay-buffer';
import { SessionBuffer } from './session-buffer';

export interface Buffers {
  event: EventBuffer;
  profile: ProfileBuffer;
  profileBackfill: ProfileBackfillBuffer;
  bot: BotBuffer;
  session: SessionBuffer;
  replay: ReplayBuffer;
  group: GroupBuffer;
}

export function createBuffers(deps: BufferDeps): Buffers {
  return {
    event: new EventBuffer(deps),
    profile: new ProfileBuffer(deps),
    profileBackfill: new ProfileBackfillBuffer(deps),
    bot: new BotBuffer(deps),
    session: new SessionBuffer(deps),
    replay: new ReplayBuffer(deps),
    group: new GroupBuffer(deps),
  };
}
