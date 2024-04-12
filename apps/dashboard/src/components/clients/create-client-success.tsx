import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { clipboard } from '@/utils/clipboard';
import { Copy, RocketIcon } from 'lucide-react';

import type { IServiceClient } from '@openpanel/db';

import { Label } from '../ui/label';

type Props = IServiceClient;

export function CreateClientSuccess({ id, secret, cors }: Props) {
  return (
    <div className="grid gap-4">
      <button className="text-left" onClick={() => clipboard(id)}>
        <Label>Client ID</Label>
        <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
          {id}
          <Copy size={16} />
        </div>
      </button>
      {secret && (
        <div className="w-full">
          <button
            className="w-full text-left"
            onClick={() => clipboard(secret)}
          >
            <Label>Client secret</Label>
            <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
              {secret}
              <Copy size={16} />
            </div>
          </button>
          {cors && (
            <p className="mt-1 text-xs text-muted-foreground">
              You will only need the secret if you want to send server events.
            </p>
          )}
        </div>
      )}
      {cors && (
        <div className="text-left">
          <Label>CORS settings</Label>
          <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
            {cors}
          </div>
        </div>
      )}
      <Alert>
        <RocketIcon className="h-4 w-4" />
        <AlertTitle>Get started!</AlertTitle>
        <AlertDescription>
          Read our{' '}
          <a
            target="_blank"
            href="https://docs.openpanel.dev"
            className="underline"
          >
            documentation
          </a>{' '}
          to get started. Easy peasy!
        </AlertDescription>
      </Alert>
    </div>
  );
}
