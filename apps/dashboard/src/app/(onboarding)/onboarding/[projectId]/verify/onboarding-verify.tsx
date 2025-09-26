'use client';

import { ButtonContainer } from '@/components/button-container';
import { LinkButton } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type {
  IServiceClient,
  IServiceEvent,
  IServiceProjectWithClients,
} from '@openpanel/db';

import Syntax from '@/components/syntax';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useClientSecret } from '@/hooks/useClientSecret';
import { clipboard } from '@/utils/clipboard';
import { local } from 'd3';
import OnboardingLayout, {
  OnboardingDescription,
} from '../../../onboarding-layout';
import VerifyListener from './onboarding-verify-listener';

type Props = {
  project: IServiceProjectWithClients;
  events: IServiceEvent[];
};

const Verify = ({ project, events }: Props) => {
  const [verified, setVerified] = useState(events.length > 0);
  const client = project.clients[0];

  if (!client) {
    return <div>Hmm, something fishy is going on. Please reload the page.</div>;
  }

  return (
    <OnboardingLayout
      title="Verify that you get events"
      description={
        <OnboardingDescription>
          Deploy your changes, as soon as you see events here, you&apos;re all
          set!
        </OnboardingDescription>
      }
    >
      <VerifyListener
        project={project}
        client={client}
        events={events}
        onVerified={setVerified}
      />

      <CurlPreview project={project} />

      <ButtonContainer>
        <LinkButton
          href={`/onboarding/${project.id}/connect`}
          size="lg"
          className="min-w-28 self-start"
          variant={'secondary'}
        >
          Back
        </LinkButton>

        <div className="flex items-center gap-8">
          {!verified && (
            <Link
              href={`/${project.organizationId}/${project.id}`}
              className=" text-muted-foreground underline"
            >
              Skip for now
            </Link>
          )}

          <LinkButton
            href={`/${project.organizationId}/${project.id}`}
            size="lg"
            className={cn(
              'min-w-28 self-start',
              !verified && 'pointer-events-none select-none opacity-20',
            )}
          >
            Your dashboard
          </LinkButton>
        </div>
      </ButtonContainer>
    </OnboardingLayout>
  );
};

export default Verify;

function CurlPreview({ project }: { project: IServiceProjectWithClients }) {
  const [secret] = useClientSecret();
  const client = project.clients[0];
  if (!client) {
    return null;
  }

  const payload: Record<string, any> = {
    type: 'track',
    payload: {
      name: 'screen_view',
      properties: {
        __title: `Testing OpenPanel - ${project.name}`,
        __path: `${project.domain}`,
        __referrer: `${process.env.NEXT_PUBLIC_DASHBOARD_URL}`,
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

  const code = `curl -X POST ${process.env.NEXT_PUBLIC_API_URL}/track \\
-H "Content-Type: application/json" \\
-H "openpanel-client-id: ${client.id}" \\
-H "openpanel-client-secret: ${secret}" \\
-H "User-Agent: ${typeof window !== 'undefined' ? window.navigator.userAgent : ''}" \\
-d '${JSON.stringify(payload)}'`;

  return (
    <div className="card">
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger
            className="px-6"
            onClick={() => {
              clipboard(code, null);
            }}
          >
            Try out the curl command
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <Syntax code={code} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
