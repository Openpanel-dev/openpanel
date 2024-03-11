import { getLiveVisitors } from '@openpanel/db';

import type { LiveCounterProps } from './live-counter';
import LiveCounter from './live-counter';

export default async function ServerLiveCounter(
  props: Omit<LiveCounterProps, 'data'>
) {
  const count = await getLiveVisitors(props.projectId);
  return <LiveCounter data={count} {...props} />;
}
