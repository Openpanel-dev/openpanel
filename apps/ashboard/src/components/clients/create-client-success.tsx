import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { clipboard } from '@/utils/clipboard';
import { Copy, RocketIcon } from 'lucide-react';
import Link from 'next/link';

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
      {secret ? (
        <button className="text-left" onClick={() => clipboard(secret)}>
          <Label>Secret</Label>
          <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
            {secret}
            <Copy size={16} />
          </div>
        </button>
      ) : (
        <div className="text-left">
          <Label>Cors settings</Label>
          <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
            {cors}
          </div>
        </div>
      )}
      <Alert>
        <RocketIcon className="h-4 w-4" />
        <AlertTitle>Get started!</AlertTitle>
        <AlertDescription>
          Read our documentation to get started. Easy peasy!
        </AlertDescription>
      </Alert>
    </div>
  );
}
