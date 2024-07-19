import { subMinutes } from 'date-fns';
import { escape } from 'sqlstring';

import { chQuery, formatClickhouseDate, TABLE_NAMES } from '@openpanel/db';

import type { Coordinate } from './coordinates';
import Map from './map';

type Props = {
  projectId: string;
};
const RealtimeMap = async ({ projectId }: Props) => {
  const res = await chQuery<Coordinate>(
    `SELECT DISTINCT city, longitude as long, latitude as lat FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(projectId)} AND created_at >= '${formatClickhouseDate(subMinutes(new Date(), 30))}' ORDER BY created_at DESC`
  );

  return <Map markers={res} />;
};

export default RealtimeMap;
