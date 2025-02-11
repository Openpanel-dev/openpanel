import { BotBuffer as BotBufferRedis } from './bot-buffer-redis';
import { EventBuffer as EventBufferRedis } from './event-buffer-redis';
import { ProfileBuffer as ProfileBufferRedis } from './profile-buffer-redis';

export const eventBuffer = new EventBufferRedis();
export const profileBuffer = new ProfileBufferRedis();
export const botBuffer = new BotBufferRedis();
