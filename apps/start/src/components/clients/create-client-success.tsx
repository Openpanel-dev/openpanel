import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RocketIcon } from 'lucide-react';

import type { IServiceClient } from '@openpanel/db';

import CopyInput from '../forms/copy-input';

type Props = { id: string; secret: string };

export function CreateClientSuccess({ id, secret }: Props) {
  return (
    <div className="grid gap-4">
      <CopyInput label="Client ID" value={id} />
      {secret && (
        <div className="w-full">
          <CopyInput label="Secret" value={secret} />
          <p className="mt-1 text-sm text-muted-foreground">
            You will only need the secret if you want to send server events.
          </p>
        </div>
      )}
      <Alert>
        <RocketIcon className="h-4 w-4" />
        <AlertTitle>Get started!</AlertTitle>
        <AlertDescription>
          Read our{' '}
          <a
            target="_blank"
            href="https://openpanel.dev/docs"
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
