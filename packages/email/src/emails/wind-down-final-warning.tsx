import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';
import { withUtm } from '../utm';

export const zWindDownFinalWarning = z.object({
  firstName: z.string().optional(),
  billingUrl: z.string(),
  deleteDate: z.string(),
  hasData: z.boolean().default(true),
  stillTracking: z.boolean().default(false),
  eventsCount: z.number().optional(),
  recentEventsCount: z.number().optional(),
});

const formatEvents = (count: number) =>
  new Intl.NumberFormat('en-US').format(count);

export type Props = z.infer<typeof zWindDownFinalWarning>;
export default WindDownFinalWarning;
export function WindDownFinalWarning({
  firstName,
  billingUrl = 'https://dashboard.openpanel.dev',
  deleteDate,
  hasData = true,
  stillTracking = false,
  eventsCount,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>
        This is the last email I'll send about this, and it's the one with real
        consequences, so I'll keep it short.
      </Text>
      <Text>
        <strong>
          On {deleteDate} your OpenPanel organization and everything in it will
          be permanently deleted.
        </strong>{' '}
        That means your projects, your settings, and
        {hasData && eventsCount
          ? ` all ${formatEvents(eventsCount)} events you've collected.`
          : ' any data associated with the account.'}{' '}
        This cannot be undone, and I won't be able to recover it afterwards.
      </Text>
      {stillTracking ? (
        <Text>
          Worth flagging: your SDKs are still installed and still calling us.
          After {deleteDate} those calls will fail against a workspace that no
          longer exists, so it's worth either subscribing or removing the
          tracking code.
        </Text>
      ) : null}
      <Text>
        It's been six weeks since your trial ended and I've written three times
        before this, so I don't want it to land as a surprise.
      </Text>
      <Text>
        Starting a plan before {deleteDate} cancels the deletion and restores
        everything immediately.
      </Text>
      <Text>
        <Button href={withUtm(billingUrl, 'wind-down-final-warning')}>
          Keep my data
        </Button>
      </Text>
      <Text>
        If you want the data but not the subscription, reply before {deleteDate}{' '}
        and I'll export it for you. If you'd rather it were gone, you don't need
        to do anything at all.
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}

WindDownFinalWarning.PreviewProps = {
  firstName: 'Alex',
  billingUrl: 'https://dashboard.openpanel.dev/org-id/billing',
  deleteDate: 'April 10',
  hasData: true,
  stillTracking: true,
  eventsCount: 842_110,
  recentEventsCount: 128_400,
};
