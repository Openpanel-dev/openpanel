import { TABLE_NAMES, ch } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';

export type IClickhouseSession = {
  id: string;
  profile_id: string;
  event_count: number;
  screen_view_count: number;
  screen_views: string[];
  entry_path: string;
  entry_origin: string;
  exit_path: string;
  exit_origin: string;
  created_at: string;
  ended_at: string;
  referrer: string;
  referrer_name: string;
  referrer_type: string;
  os: string;
  os_version: string;
  browser: string;
  browser_version: string;
  device: string;
  brand: string;
  model: string;
  country: string;
  region: string;
  city: string;
  longitude: number | null;
  latitude: number | null;
  is_bounce: boolean;
  project_id: string;
  device_id: string;
  duration: number;
  utm_medium: string;
  utm_source: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  revenue: number;
  sign: 1 | 0;
  version: number;
  properties: Record<string, string>;
};

class SessionService {
  constructor(private client: typeof ch) {}

  byId(sessionId: string, projectId: string) {
    return clix(this.client)
      .select<IClickhouseSession>(['*'])
      .from(TABLE_NAMES.sessions)
      .where('id', '=', sessionId)
      .where('project_id', '=', projectId)
      .execute()
      .then((res) => res[0]);
  }
}

export const sessionService = new SessionService(ch);
