import { z } from 'zod';

/** Group membership is copied onto every session write, so both are bounded. */
export const MAX_GROUPS_PER_EVENT = 100;
export const MAX_GROUP_ID_LENGTH = 256;

export const zGroupId = z.string().min(1).max(MAX_GROUP_ID_LENGTH);
export const zGroupIds = z.array(zGroupId).max(MAX_GROUPS_PER_EVENT);
