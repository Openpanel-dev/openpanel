import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RocketIcon } from 'lucide-react';

import type { IServiceClient } from '@openpanel/db';

import CopyInput from '../forms/copy-input';
import { Label } from '../ui/label';

type Props = IServiceClient;

export function CreateClientSuccess({ id, secret, cors }: Props) {
  return (
    <div className="grid gap-4">
      <CopyInput label="Client ID" value={id} />
      {secret && (
        <div className="w-full">
          <CopyInput label="Secret" value={secret} />
          {cors && (
            <p className="mt-1 text-sm text-muted-foreground">
              You will only need the secret if you want to send server events.
            </p>
          )}
        </div>
      )}
      {cors && (
        <div className="text-left">
          <Label>CORS settings</Label>
          <div className="font-mono flex items-center justify-between rounded border-input bg-def-200 p-2 px-3 ">
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
            rel="noreferrer"
          >
            documentation
          </a>{' '}
          to get started. Easy peasy!
        </AlertDescription>
      </Alert>
    </div>
  );
}
