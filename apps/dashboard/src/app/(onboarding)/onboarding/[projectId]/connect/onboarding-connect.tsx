'use client';

import { useEffect } from 'react';
import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Alert } from '@/components/ui/alert';
import { LinkButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyIcon, LockIcon } from 'lucide-react';

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
      <div className="flex flex-col gap-4 rounded-xl border bg-slate-100 p-4 md:p-6">
        <div className="flex items-center gap-2 text-2xl capitalize">
          <LockIcon />
          Credentials
        </div>
        <InputWithLabel label="Client ID" disabled value={client.id} />
        <InputWithLabel
          label="Client Secret"
          disabled
          value={client.secret ?? 'unknown'}
        />
      </div>
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
