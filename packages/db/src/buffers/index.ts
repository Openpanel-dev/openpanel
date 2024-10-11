import { BotBuffer } from './bot-buffer';
import { EventBuffer } from './event-buffer';
import { ProfileBuffer } from './profile-buffer';

export const eventBuffer = new EventBuffer();
export const profileBuffer = new ProfileBuffer();
export const botBuffer = new BotBuffer();
