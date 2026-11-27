import { createFileRoute } from '@tanstack/react-router';
import { ExternalLinkIcon, PlusIcon } from 'lucide-react';
import { useId, useState } from 'react';
import CopyInput from '@/components/forms/copy-input';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppContext } from '@/hooks/use-app-context';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/revenuecat'
)({
  component: Component,
});

const DOCS_URL = 'https://openpanel.dev/docs/revenuecat';
const AUTHORIZATION_PLACEHOLDER = 'Bearer base64(clientId:clientSecret)';

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

/** Built in the browser: the secret never leaves this page. */
function revenueCatAuthorization(
  clientId: string,
  clientSecret: string
): string | null {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!(id && secret)) {
    return null;
  }
  return `Bearer ${btoa(`${id}:${secret}`)}`;
}

function Component() {
  const { apiUrl } = useAppContext();
  const webhookUrl = `${apiUrl}/integrations/revenuecat`;
  const clientIdField = useId();
  const clientSecretField = useId();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const authorization = revenueCatAuthorization(clientId, clientSecret);

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

      <ol className="col list-decimal gap-5 pl-5 text-sm">
        <li className="col gap-2">
          <div className="font-medium">Get a client of this project</div>
          <p className="text-muted-foreground">
            Use the client id and secret the app already sends events with, or
            create a new client. The secret is only shown once, when the client
            is created.
          </p>
          <div>
            <Button
              icon={PlusIcon}
              onClick={() => pushModal('AddClient')}
              variant="outline"
            >
              Create client
            </Button>
          </div>
        </li>

        <li className="col gap-3">
          <div className="font-medium">Make the Authorization header</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="col gap-1">
              <Label htmlFor={clientIdField}>Client id</Label>
              <Input
                autoComplete="off"
                id={clientIdField}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="00000000-0000-4000-8000-000000000000"
                value={clientId}
              />
            </div>
            <div className="col gap-1">
              <Label htmlFor={clientSecretField}>Client secret</Label>
              <Input
                autoComplete="off"
                id={clientSecretField}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder="sec_..."
                type="password"
                value={clientSecret}
              />
            </div>
          </div>
          <CopyInput
            label="Authorization header"
            value={authorization ?? AUTHORIZATION_PLACEHOLDER}
          />
          <p className="text-muted-foreground text-xs">
            Made in your browser. Nothing you type here is sent to OpenPanel.
          </p>
        </li>

        <li className="col gap-3">
          <div className="font-medium">Add the webhook in RevenueCat</div>
          <p className="text-muted-foreground">
            In RevenueCat, open <strong>Integrations → Webhooks</strong>, add a
            webhook, and paste these two values. Then press{' '}
            <strong>Send test event</strong>: OpenPanel answers 200.
          </p>
          <CopyInput label="Webhook URL" value={webhookUrl} />
          <p className="text-muted-foreground text-xs">
            Use one webhook per environment. A development project gets its own
            webhook with its own client.
          </p>
        </li>
      </ol>

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
