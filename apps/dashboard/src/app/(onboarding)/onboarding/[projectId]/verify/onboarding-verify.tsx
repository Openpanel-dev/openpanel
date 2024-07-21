'use client';

import { useState } from 'react';
import { ButtonContainer } from '@/components/button-container';
import { LinkButton } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import Link from 'next/link';

import type { IServiceEvent, IServiceProjectWithClients } from '@openpanel/db';

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
      {/* 
      Sadly we cant have a verify for each type since we use the same client for all different types (website, app, backend)
      
      Pros: the user just need to keep track of one client id/secret
      Cons: we cant verify each type individually

      Might be a good idea to add a verify for each type in the future, but for now we will just have one verify for all types

      {project.types.map((type) => {
        const Component = {
          website: VerifyWeb,
          app: VerifyApp,
          backend: VerifyBackend,
        }[type];

        return <Component key={type} client={client} events={events} />;
      })} */}
      <VerifyListener
        project={project}
        client={client}
        events={events}
        onVerified={setVerified}
      />
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
              href={`/${project.organizationSlug}/${project.id}`}
              className="text-sm text-muted-foreground underline"
            >
              Skip for now
            </Link>
          )}

          <LinkButton
            href="/"
            size="lg"
            className={cn(
              'min-w-28 self-start',
              !verified && 'pointer-events-none select-none opacity-20'
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
