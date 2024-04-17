'use client';

import { ButtonContainer } from '@/components/button-container';
import { LinkButton } from '@/components/ui/button';

import type { IServiceProjectWithClients } from '@openpanel/db';

import OnboardingLayout, {
  OnboardingDescription,
} from '../../../onboarding-layout';
import ConnectApp from './connect-app';
import ConnectBackend from './connect-backend';
import ConnectWeb from './connect-web';

type Props = {
  project: IServiceProjectWithClients;
};

const Connect = ({ project }: Props) => {
  const client = project.clients[0];

  if (!client) {
    return <div>Hmm, something fishy is going on. Please reload the page.</div>;
  }

  return (
    <OnboardingLayout
      title="Setup your data sources"
      description={
        <OnboardingDescription>
          Let&apos;s connect your data sources to OpenPanel
        </OnboardingDescription>
      }
    >
      {project.types.map((type) => {
        const Component = {
          website: ConnectWeb,
          app: ConnectApp,
          backend: ConnectBackend,
        }[type];

        return <Component key={type} client={client} />;
      })}
      <ButtonContainer>
        <div />
        <LinkButton
          prefetch={false}
          href={`/onboarding/${project.id}/verify`}
          size="lg"
          className="min-w-28 self-start"
        >
          Next
        </LinkButton>
      </ButtonContainer>
    </OnboardingLayout>
  );
};

export default Connect;
