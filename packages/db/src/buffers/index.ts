import { BotBuffer } from './bot-buffer';
import { BotBuffer as NewBotBuffer } from './bot-buffer-psql';
import { EventBuffer } from './event-buffer';
import { EventBuffer as NewEventBuffer } from './event-buffer-psql';
import { ProfileBuffer } from './profile-buffer';
import { ProfileBuffer as NewProfileBuffer } from './profile-buffer-psql';

export const eventBuffer = process.env.USE_NEW_BUFFER
  ? new NewEventBuffer()
  : new EventBuffer();
export const profileBuffer = process.env.USE_NEW_BUFFER
  ? new NewProfileBuffer()
  : new ProfileBuffer();
export const botBuffer = process.env.USE_NEW_BUFFER
  ? new NewBotBuffer()
  : new BotBuffer();
