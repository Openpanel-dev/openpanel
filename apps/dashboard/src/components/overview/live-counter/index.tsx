import withSuspense from '@/hocs/with-suspense';

import { eventBuffer } from '@openpanel/db';

import type { LiveCounterProps } from './live-counter';
import LiveCounter from './live-counter';

async function ServerLiveCounter(props: Omit<LiveCounterProps, 'data'>) {
  const count = await eventBuffer.getActiveVisitorCount(props.projectId);
  return <LiveCounter data={count} {...props} />;
}

export default withSuspense(ServerLiveCounter, () => <div />);
