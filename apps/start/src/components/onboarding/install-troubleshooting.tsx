import type { IServiceProjectWithClients } from '@openpanel/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { curlSnippet, type SnippetContext } from './install-snippets';
import CopyInput from '@/components/forms/copy-input';
import { WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import Syntax from '@/components/syntax';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { trackFunnel } from '@/utils/funnel-tracking';

const TEST_EVENT_NAME = 'openpanel_test_event';

function normalizeOrigins(values: string[]) {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) =>
      value === '*' || /^https?:\/\//.test(value) ? value : `https://${value}`
    );
}

/** The checks that resolve most "no events" reports, in the order they usually apply. */
export function InstallTroubleshooting({
  project,
  context,
}: {
  project: IServiceProjectWithClients;
  context: SnippetContext;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
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
  const isWebsite = project.types.includes('website');

  return (
    <ol className="col gap-6">
      <li className="col gap-2">
        <div className="font-medium">
          1. Did the page or app actually load with the snippet?
        </div>
        <p className="text-muted-foreground">
          Events are sent when a screen is viewed. Deploy or run the code, then
          open it once and reload this page. Ad blockers can also stop the
          request; try an incognito window without extensions.
        </p>
      </li>
      <li className="col gap-3">
        <div className="font-medium">
          2. Is the client ID the one for this project?
        </div>
        <CopyInput label="Client ID" value={context.clientId} />
      </li>
      {isWebsite && (
        <li className="col gap-3">
          <div className="font-medium">3. Is your domain allowed?</div>
          <p className="text-muted-foreground">
            Browser events are accepted only from these origins. Add every
            domain your site runs on, including localhost while testing.
          </p>
          <WithLabel label="Allowed domains">
            <TagInput
              onChange={(values) => {
                const cors = normalizeOrigins(values);
                trackFunnel('onboarding_allowed_domains_updated', {
                  projectId: project.id,
                  count: cors.length,
                  wildcard: cors.includes('*'),
                });
                updateProject.mutate({ id: project.id, cors });
              }}
              placeholder="Add a domain and press Enter"
              renderTag={(tag) => (tag === '*' ? 'Any domain' : tag)}
              value={project.cors ?? []}
            />
          </WithLabel>
        </li>
      )}
      <li className="col gap-3">
        <div className="font-medium">
          {isWebsite ? '4.' : '3.'} Send a test event from your terminal
        </div>
        <p className="text-muted-foreground">
          This bypasses your code entirely. If it shows up above, the project is
          fine and the problem is in the integration.
        </p>
        <Syntax
          code={curlSnippet(context, TEST_EVENT_NAME)}
          language="bash"
          onCopy={() =>
            trackFunnel('onboarding_test_curl_copied', {
              projectId: project.id,
            })
          }
          wrapLines
        />
      </li>
      <li className="text-muted-foreground">
        Still stuck? Write to{' '}
        <a
          className="underline"
          href="mailto:hello@openpanel.dev"
          onClick={() =>
            trackFunnel('onboarding_support_link_clicked', {
              projectId: project.id,
              target: 'email',
            })
          }
        >
          hello@openpanel.dev
        </a>{' '}
        or join the{' '}
        <a
          className="underline"
          href="https://go.openpanel.dev/discord"
          onClick={() =>
            trackFunnel('onboarding_support_link_clicked', {
              projectId: project.id,
              target: 'discord',
            })
          }
          rel="noreferrer"
          target="_blank"
        >
          Discord
        </a>
        . We answer quickly.
      </li>
    </ol>
  );
}
