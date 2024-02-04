/* eslint-disable */

export type IDBEvent = {
  id: string;
  name: string;
  profile_id?: string;
  project_id: string;
  properties: Record<string, string>;
  created_at: string;
};

export type IDBProfile = {
  id: string;
  external_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar?: string;
  properties: Record<string, string>;
  project_id: String;
  created_at: string;
};
