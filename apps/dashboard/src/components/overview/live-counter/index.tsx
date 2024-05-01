import withSuspense from '@/hocs/with-suspense';

import { getLiveVisitors } from '@openpanel/db';

import type { LiveCounterProps } from './live-counter';
import LiveCounter from './live-counter';

async function ServerLiveCounter(props: Omit<LiveCounterProps, 'data'>) {
  const count = await getLiveVisitors(props.projectId);
  return <LiveCounter data={count} {...props} />;
}

export default withSuspense(ServerLiveCounter, () => <div />);
