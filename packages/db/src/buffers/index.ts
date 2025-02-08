import { BotBuffer as BotBufferPsql } from './bot-buffer-psql';
import { BotBuffer as BotBufferRedis } from './bot-buffer-redis';
import { EventBuffer as EventBufferPsql } from './event-buffer-psql';
import { EventBuffer as EventBufferRedis } from './event-buffer-redis';
import { ProfileBuffer as ProfileBufferPsql } from './profile-buffer-psql';
import { ProfileBuffer as ProfileBufferRedis } from './profile-buffer-redis';

export const eventBuffer = process.env.USE_NEW_BUFFER
  ? new EventBufferRedis()
  : new EventBufferPsql();
export const profileBuffer = process.env.USE_NEW_BUFFER
  ? new ProfileBufferRedis()
  : new ProfileBufferPsql();
export const botBuffer = process.env.USE_NEW_BUFFER
  ? new BotBufferRedis()
  : new BotBufferPsql();
