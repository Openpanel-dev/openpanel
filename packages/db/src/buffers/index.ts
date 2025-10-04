import { BotBuffer as BotBufferRedis } from './bot-buffer';
import { EventBuffer as EventBufferRedis } from './event-buffer';
import { ProfileBuffer as ProfileBufferRedis } from './profile-buffer';
import { SessionBuffer } from './session-buffer';

export const eventBuffer = new EventBufferRedis();
export const profileBuffer = new ProfileBufferRedis();
export const botBuffer = new BotBufferRedis();
export const sessionBuffer = new SessionBuffer();
