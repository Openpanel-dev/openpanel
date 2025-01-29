import { BotBuffer } from './bot-buffer-psql';
import { EventBuffer } from './event-buffer-psql';
import { ProfileBuffer } from './profile-buffer-psql';

export const eventBuffer = new EventBuffer();
export const profileBuffer = new ProfileBuffer();
export const botBuffer = new BotBuffer();
