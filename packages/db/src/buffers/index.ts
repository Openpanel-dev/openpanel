import { BotBuffer } from './bot-buffer';
import { EventBuffer as EventBufferOld } from './event-buffer';
import { EventBuffer } from './event-buffer-psql';
import { ProfileBuffer } from './profile-buffer';

export const eventBuffer = new EventBuffer();
export const profileBuffer = new ProfileBuffer();
export const botBuffer = new BotBuffer();
