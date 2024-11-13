import { pushModal } from '@/modals';
import { SmartphoneIcon } from 'lucide-react';

import type { IServiceClient } from '@openpanel/db';
import { frameworks } from '@openpanel/sdk-info';

type Props = {
  client: IServiceClient | null;
};

const ConnectApp = ({ client }: Props) => {
  return (
    <div className="rounded-lg border p-4 md:p-6">
      <div className="flex items-center gap-2 text-2xl capitalize">
        <SmartphoneIcon />
        App
      </div>
      <p className="mt-2  text-muted-foreground">
        Pick a framework below to get started.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {frameworks
          .filter((framework) => framework.type.includes('app'))
          .map((framework) => (
            <button
              type="button"
              onClick={() =>
                pushModal('Instructions', {
                  framework,
                  client,
                })
              }
              className="flex items-center gap-4 rounded-md border p-2 py-2 text-left"
              key={framework.name}
            >
              <div className="h-10 w-10 rounded-md bg-def-200 p-2">
                <framework.IconComponent className="h-full w-full" />
              </div>
              <div className="flex-1 font-semibold">{framework.name}</div>
            </button>
          ))}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Missing a framework?{' '}
        <a
          href="mailto:hello@openpanel.dev"
          className="text-foreground underline"
        >
          Let us know!
        </a>
      </p>
    </div>
  );
};

export default ConnectApp;
