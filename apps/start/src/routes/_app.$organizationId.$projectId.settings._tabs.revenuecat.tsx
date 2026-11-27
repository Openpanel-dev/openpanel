import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircleIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import CopyInput from '@/components/forms/copy-input';
import { Skeleton } from '@/components/skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import { cn } from '@/utils/cn';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/revenuecat'
)({
  component: Component,
});

const EVENTS: { revenuecat: string; openpanel: string }[] = [
  {
    revenuecat: 'INITIAL_PURCHASE',
    openpanel: 'rc_initial_purchase_event · rc_trial_started_event',
  },
  {
    revenuecat: 'RENEWAL',
    openpanel: 'rc_renewal_event · rc_trial_converted_event',
  },
  {
    revenuecat: 'CANCELLATION',
    openpanel: 'rc_cancellation_event · rc_trial_cancelled_event',
  },
  { revenuecat: 'UNCANCELLATION', openpanel: 'rc_uncancellation_event' },
  {
    revenuecat: 'NON_RENEWING_PURCHASE',
    openpanel: 'rc_non_subscription_purchase_event',
  },
  {
    revenuecat: 'SUBSCRIPTION_PAUSED',
    openpanel: 'rc_subscription_paused_event',
  },
  { revenuecat: 'EXPIRATION', openpanel: 'rc_expiration_event' },
  { revenuecat: 'BILLING_ISSUE', openpanel: 'rc_billing_issue_event' },
  { revenuecat: 'PRODUCT_CHANGE', openpanel: 'rc_product_change_event' },
];

const DOCS_URL = 'https://openpanel.dev/docs/revenuecat';
const MASKED_TAIL_LENGTH = 4;
const WAITING_REFETCH_MS = 5000;

function maskAuthorization(authorization: string): string {
  return `Bearer rcwh_••••••••${authorization.slice(-MASKED_TAIL_LENGTH)}`;
}

function Component() {
  const { apiUrl } = useAppContext();
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const webhookUrl = `${apiUrl}/integrations/revenuecat`;

  const webhookQuery = useQuery(
    trpc.revenueCat.get.queryOptions(
      { projectId },
      {
        refetchInterval: (query) =>
          query.state.data?.enabled && !query.state.data.lastEventAt
            ? WAITING_REFETCH_MS
            : false,
      }
    )
  );
  const webhook = webhookQuery.data;

  const onSaved = (data: typeof webhook) => {
    queryClient.setQueryData(trpc.revenueCat.get.queryKey({ projectId }), data);
  };
  const onFailed = (error: { message: string }) => toast.error(error.message);

  const enable = useMutation(
    trpc.revenueCat.enable.mutationOptions({
      onSuccess: onSaved,
      onError: onFailed,
    })
  );
  const rotate = useMutation(
    trpc.revenueCat.rotate.mutationOptions({
      onSuccess: (data) => {
        onSaved(data);
        toast.success('New header made. Paste it in RevenueCat.');
      },
      onError: onFailed,
    })
  );
  const disable = useMutation(
    trpc.revenueCat.disable.mutationOptions({
      onSuccess: onSaved,
      onError: onFailed,
    })
  );

  return (
    <div className="col gap-6">
      <div className="col gap-2">
        <h2 className="font-semibold text-lg">RevenueCat</h2>
        <p className="text-muted-foreground text-sm">
          Send RevenueCat subscription events straight to this project:
          renewals, expirations and billing issues that happen while the app is
          closed, plus the revenue of every paid purchase.
        </p>
      </div>

      <div className="col gap-4 rounded-lg border p-4">
        {webhook === undefined && <Skeleton className="h-24 w-full" />}

        {webhook && !webhook.enabled && (
          <div className="col gap-3 text-sm">
            <p className="text-muted-foreground">
              This project has no RevenueCat webhook yet. Turn it on to get a
              webhook URL and the header RevenueCat sends with it.
            </p>
            {webhook.canWrite ? (
              <div>
                <Button
                  loading={enable.isPending}
                  onClick={() => enable.mutate({ projectId })}
                >
                  Turn on
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Ask someone who can edit this project to turn it on.
              </p>
            )}
          </div>
        )}

        {webhook?.enabled && (
          <>
            <WebhookStatus
              lastEventAt={webhook.lastEventAt}
              lastEventType={webhook.lastEventType}
            />

            <ol className="col list-decimal gap-4 pl-5 text-sm">
              <li>
                In RevenueCat, open <strong>Integrations → Webhooks</strong> and
                add a webhook.
              </li>
              <li>
                <div className="col gap-2">
                  <span>Paste the webhook URL.</span>
                  <CopyInput label="" value={webhookUrl} />
                </div>
              </li>
              <li>
                <div className="col gap-2">
                  <span>
                    Paste this as the{' '}
                    <strong>Authorization header value</strong>.
                  </span>
                  {webhook.authorization ? (
                    <CopyInput
                      displayValue={maskAuthorization(webhook.authorization)}
                      label=""
                      value={webhook.authorization}
                    />
                  ) : (
                    <p className="text-muted-foreground">
                      Only people who can edit this project see the header.
                    </p>
                  )}
                </div>
              </li>
              <li>
                Press <strong>Send test event</strong>. The status above shows
                it within a few seconds.
              </li>
            </ol>

            <p className="text-muted-foreground text-xs">
              The header only works for this project. Each environment, like
              production and development, is its own project with its own
              header.
            </p>

            {webhook.canWrite && (
              <div className="row flex-wrap gap-2">
                <Button
                  loading={rotate.isPending}
                  onClick={() =>
                    showConfirm({
                      title: 'Make a new header?',
                      text: 'The current header stops working right away. RevenueCat fails until you paste the new one there.',
                      onConfirm: () => rotate.mutate({ projectId }),
                    })
                  }
                  variant="outline"
                >
                  Make a new header
                </Button>
                <Button
                  loading={disable.isPending}
                  onClick={() =>
                    showConfirm({
                      title: 'Turn off the RevenueCat webhook?',
                      text: 'RevenueCat events stop arriving in this project. Remove the webhook in RevenueCat too.',
                      onConfirm: () => disable.mutate({ projectId }),
                    })
                  }
                  variant="outline"
                >
                  Turn off
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="col gap-2">
        <div className="font-medium">What you get</div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-def-100 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">RevenueCat</th>
                <th className="px-3 py-2 font-medium">OpenPanel event</th>
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((row) => (
                <tr className="border-t" key={row.revenuecat}>
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.revenuecat}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.openpanel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="col list-disc gap-1 pl-5 text-muted-foreground text-sm">
          <li>
            Each event belongs to the RevenueCat app user id. Log the user in to
            RevenueCat with the same id you pass to <code>identify</code>.
          </li>
          <li>
            Events keep the time RevenueCat reports, not the time the webhook
            arrives.
          </li>
          <li>
            A paid purchase, renewal or trial conversion in production also adds
            a <code>revenue</code> event in US dollars. Refunds are flagged on
            the cancellation.
          </li>
          <li>RevenueCat retries are recorded once.</li>
        </ul>
      </div>

      <a
        className={cn(buttonVariants({ variant: 'outline' }), 'self-start')}
        href={DOCS_URL}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLinkIcon className="h-4 w-4" />
        Read the RevenueCat docs
      </a>
    </div>
  );
}

function WebhookStatus({
  lastEventAt,
  lastEventType,
}: {
  lastEventAt: Date | string | null;
  lastEventType: string | null;
}) {
  if (!lastEventAt) {
    return (
      <div className="row items-center gap-2 text-muted-foreground text-sm">
        <Loader2Icon className="animate-spin" size={16} />
        On. Waiting for the first event from RevenueCat.
      </div>
    );
  }
  return (
    <div className="row items-center gap-2 text-sm">
      <CheckCircleIcon className="text-emerald-600" size={16} />
      Receiving. Last event: <code>{lastEventType}</code>,{' '}
      {formatDistanceToNow(new Date(lastEventAt), { addSuffix: true })}.
    </div>
  );
}
