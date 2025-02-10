import { BotBuffer as BotBufferPsql } from './bot-buffer-psql';
import { BotBuffer as BotBufferRedis } from './bot-buffer-redis';
import { EventBuffer as EventBufferPsql } from './event-buffer-psql';
import { EventBuffer as EventBufferRedis } from './event-buffer-redis';
import { ProfileBuffer as ProfileBufferPsql } from './profile-buffer-psql';
import { ProfileBuffer as ProfileBufferRedis } from './profile-buffer-redis';

export const eventBuffer = new EventBufferRedis();
export const profileBuffer = new ProfileBufferRedis();
export const botBuffer = new BotBufferRedis();
