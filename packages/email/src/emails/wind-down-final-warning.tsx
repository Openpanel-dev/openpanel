import { Text } from '@react-email/components';
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
        Your trial ended six weeks ago. This is my fourth and last email about
        it.
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
        I can't recover any of it afterwards.
      </Text>
      {stillTracking ? (
        <Text>
          Your SDKs are still sending us events. After {deleteDate} those
          requests will fail, so either start a plan or remove the tracking
          code.
        </Text>
      ) : null}
      <Text>
        Start a plan before {deleteDate} to cancel the deletion. Everything is
        restored right away.
      </Text>
      <Text>
        <Button href={withUtm(billingUrl, 'wind-down-final-warning')}>
          Keep my data
        </Button>
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
