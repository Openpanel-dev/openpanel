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
import { Trans, useTranslation } from 'react-i18next';

export function VerifyFaq({
  project,
}: {
  project: IServiceProjectWithClients;
}) {
  const { t } = useTranslation();
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
        toast.success(t('onboarding.verify_allowed_domains_updated'));
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
            {t('onboarding.verify_faq_no_events_title')}
          </AccordionTrigger>
          <AccordionContent className="col gap-4 p-6 pt-2">
            <p>{t('onboarding.verify_faq_intro')}</p>
            <div className="col gap-2">
              <Alert>
                <UserIcon size={16} />
                <AlertTitle>
                  {t('onboarding.verify_faq_client_id_title')}
                </AlertTitle>
                <AlertDescription className="col gap-2">
                  <span>
                    <Trans
                      components={{
                        code: <code />,
                      }}
                      i18nKey="onboarding.verify_faq_client_id_description"
                    />
                  </span>
                  <CopyInput
                    className="[&_.font-mono]:text-sm"
                    label={t('onboarding.field_client_id')}
                    value={client.id}
                  />
                </AlertDescription>
              </Alert>
              <Alert>
                <GlobeIcon size={16} />
                <AlertTitle>
                  {t('onboarding.verify_faq_domain_title')}
                </AlertTitle>
                <AlertDescription className="col gap-2">
                  <span>{t('onboarding.verify_faq_domain_description')}</span>
                  <WithLabel label={t('onboarding.field_allowed_domains')}>
                    <TagInput
                      onChange={handleCorsChange}
                      placeholder={t(
                        'onboarding.allowed_domains_placeholder'
                      )}
                      renderTag={(tag: string) =>
                        tag === '*'
                          ? t('onboarding.allowed_domains_any_tag')
                          : tag
                      }
                      value={project.cors ?? []}
                    />
                  </WithLabel>
                </AlertDescription>
              </Alert>
              <Alert>
                <KeyIcon size={16} />
                <AlertTitle>
                  {t('onboarding.verify_faq_client_secret_title')}
                </AlertTitle>
                <AlertDescription className="col gap-2">
                  <span>
                    <Trans
                      components={{
                        code: <code />,
                      }}
                      i18nKey="onboarding.verify_faq_client_secret_description"
                    />
                  </span>
                  {showSecret && (
                    <CopyInput
                      className="[&_.font-mono]:text-sm"
                      label={t('onboarding.field_client_secret')}
                      value={secret}
                    />
                  )}
                </AlertDescription>
              </Alert>
            </div>
            <p>
              <Trans
                components={{
                  discord: (
                    <a
                      className="underline"
                      href="https://go.openpanel.dev/discord"
                    />
                  ),
                  email: (
                    <a className="underline" href="mailto:hello@openpanel.dev" />
                  ),
                }}
                i18nKey="onboarding.verify_support_description"
              />
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger className="px-6">
            {t('onboarding.verify_personal_curl_title')}
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <Syntax code={code} language="bash" />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
