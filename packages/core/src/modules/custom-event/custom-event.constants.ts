import { z } from 'zod';
import { zCustomEventItem } from '../report/report.constants';

export const CUSTOM_EVENT_NAME_MAX_LENGTH = 100;
export const CUSTOM_EVENT_MAX_ITEMS = 200;

export const zCustomEventInput = z.object({
  projectId: z.string(),
  name: z.string().trim().min(1).max(CUSTOM_EVENT_NAME_MAX_LENGTH),
  items: z.array(zCustomEventItem).min(1).max(CUSTOM_EVENT_MAX_ITEMS),
});

export type ICustomEventInput = z.infer<typeof zCustomEventInput>;

export const zCustomEventUpdate = zCustomEventInput.extend({
  id: z.string().uuid(),
});

export type ICustomEventUpdate = z.infer<typeof zCustomEventUpdate>;
