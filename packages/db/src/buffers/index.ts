import { BotBuffer as BotBufferRedis } from './bot-buffer';
import { EventBuffer as EventBufferRedis } from './event-buffer';
import { ProfileBackfillBuffer } from './profile-backfill-buffer';
import { ProfileBuffer as ProfileBufferRedis } from './profile-buffer';
import { ReplayBuffer } from './replay-buffer';
import { SessionBuffer } from './session-buffer';

export const eventBuffer = new EventBufferRedis();
export const profileBuffer = new ProfileBufferRedis();
export const botBuffer = new BotBufferRedis();
export const sessionBuffer = new SessionBuffer();
export const profileBackfillBuffer = new ProfileBackfillBuffer();
export const replayBuffer = new ReplayBuffer();

export type { ProfileBackfillEntry } from './profile-backfill-buffer';
export type { IClickhouseSessionReplayChunk } from './replay-buffer';
