import { pushModal } from '@/modals';
import { ServerIcon } from 'lucide-react';

import Syntax from '@/components/syntax';
import type { IServiceClient } from '@openpanel/db';
import { frameworks } from '@openpanel/sdk-info';

type Props = {
  client: IServiceClient | null;
};

const ConnectBackend = ({ client }: Props) => {
  return (
    <div className="col gap-4 rounded-lg border p-4 md:p-6">
      <div className="flex items-center gap-2 text-2xl capitalize">
        <ServerIcon />
        Backend
      </div>

      <div>
        <div className="text-lg font-medium mb-2">
          Try with a basic curl command
        </div>
        <Syntax
          language="bash"
          className="border"
          code={`curl -X POST ${process.env.NEXT_PUBLIC_API_URL}/track \\
-H "Content-Type: application/json" \\
-H "openpanel-client-id: ${client?.id}" \\
-H "openpanel-client-secret: ${client?.secret}" \\
-d '{
  "type": "track",
  "payload": {
    "name": "test_event",
    "properties": {
      "test": "property"
    }
  }
}'`}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-2">
          Pick a framework below to get started.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {frameworks
            .filter((framework) => framework.type.includes('backend'))
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
    </div>
  );
};

export default ConnectBackend;
