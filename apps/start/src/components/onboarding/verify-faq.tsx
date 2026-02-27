import type { IServiceProjectWithClients } from '@openpanel/db';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GlobeIcon, KeyIcon, UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import CopyInput from '../forms/copy-input';
import { WithLabel } from '../forms/input-with-label';
import TagInput from '../forms/tag-input';
import Syntax from '../syntax';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { useAppContext } from '@/hooks/use-app-context';
import { useClientSecret } from '@/hooks/use-client-secret';
import { handleError, useTRPC } from '@/integrations/trpc/react';

export function VerifyFaq({
  project,
}: {
  project: IServiceProjectWithClients;
}) {
  const context = useAppContext();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [secret] = useClientSecret();

  const updateProject = useMutation(
    trpc.project.update.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.project.getProjectWithClients.queryFilter({
            projectId: project.id,
          })
        );
        toast.success('Allowed domains updated');
      },
    })
  );

  const client = project.clients[0];
  if (!client) {
    return null;
  }

  const handleCorsChange = (newValue: string[]) => {
    const normalized = newValue
      .map((item: string) => {
        const trimmed = item.trim();
        if (
          trimmed.startsWith('http://') ||
          trimmed.startsWith('https://') ||
          trimmed === '*'
        ) {
          return trimmed;
        }
        return trimmed ? `https://${trimmed}` : trimmed;
      })
      .filter(Boolean);
    updateProject.mutate({ id: project.id, cors: normalized });
  };

  const showSecret = secret && secret !== '[CLIENT_SECRET]';

  const payload: Record<string, any> = {
    type: 'track',
    payload: {
      name: 'screen_view',
      properties: {
        __title: `Testing OpenPanel - ${project.name}`,
        __path: `${project.domain}`,
        __referrer: `${context.dashboardUrl}`,
      },
    },
  };

  if (project.types.includes('app')) {
    payload.payload.properties.__path = '/';
    delete payload.payload.properties.__referrer;
  }

  if (project.types.includes('backend')) {
    payload.payload.name = 'test_event';
    payload.payload.properties = {};
  }

  const code = `curl -X POST ${context.apiUrl}/track \\
-H "Content-Type: application/json" \\
-H "openpanel-client-id: ${client.id}" \\
-H "openpanel-client-secret: ${secret}" \\
-H "User-Agent: ${typeof window !== 'undefined' ? window.navigator.userAgent : ''}" \\
-d '${JSON.stringify(payload)}'`;

  return (
    <div className="card">
      <Accordion collapsible type="single">
        <AccordionItem value="item-1">
          <AccordionTrigger className="px-6">
            No events received?
          </AccordionTrigger>
          <AccordionContent className="col gap-4 p-6 pt-2">
            <p>
              Don't worry, this happens to everyone. Here are a few things you
              can check:
            </p>
            <div className="col gap-2">
              <Alert>
                <UserIcon size={16} />
                <AlertTitle>Ensure client ID is correct</AlertTitle>
                <AlertDescription className="col gap-2">
                  <span>
                    For web tracking, the <code>clientId</code> in your snippet
                    must match this project. Copy it here if needed:
                  </span>
                  <CopyInput
                    className="[&_.font-mono]:text-sm"
                    label="Client ID"
                    value={client.id}
                  />
                </AlertDescription>
              </Alert>
              <Alert>
                <GlobeIcon size={16} />
                <AlertTitle>Correct domain configured</AlertTitle>
                <AlertDescription className="col gap-2">
                  <span>
                    For websites it&apos;s important that the domain is
                    correctly configured. We authenticate requests based on the
                    domain. Update allowed domains below:
                  </span>
                  <WithLabel label="Allowed domains">
                    <TagInput
                      onChange={handleCorsChange}
                      placeholder="Accept events from these domains"
                      renderTag={(tag: string) =>
                        tag === '*' ? 'Accept events from any domains' : tag
                      }
                      value={project.cors ?? []}
                    />
                  </WithLabel>
                </AlertDescription>
              </Alert>
              <Alert>
                <KeyIcon size={16} />
                <AlertTitle>Wrong client secret</AlertTitle>
                <AlertDescription className="col gap-2">
                  <span>
                    For app and backend events you need the correct{' '}
                    <code>clientSecret</code>. Copy it here if needed. Never use
                    the client secret in web or client-side code—it would expose
                    your credentials.
                  </span>
                  {showSecret && (
                    <CopyInput
                      className="[&_.font-mono]:text-sm"
                      label="Client secret"
                      value={secret}
                    />
                  )}
                </AlertDescription>
              </Alert>
            </div>
            <p>
              Still have issues? Join our{' '}
              <a className="underline" href="https://go.openpanel.dev/discord">
                discord channel
              </a>{' '}
              give us an email at{' '}
              <a className="underline" href="mailto:hello@openpanel.dev">
                hello@openpanel.dev
              </a>{' '}
              and we&apos;ll help you out.
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger className="px-6">
            Personal curl example
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <Syntax code={code} language="bash" />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
