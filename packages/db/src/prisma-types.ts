/* eslint-disable */

import { Profile } from '@prisma/client';

export type IDBEvent = {
  id: string;
  name: string;
  profile_id?: string;
  project_id: string;
  properties: Record<string, string>;
  created_at: string;
};

export type IDBProfile = Omit<Profile, 'properties'> & {
  properties: Record<string, unknown>;
};
