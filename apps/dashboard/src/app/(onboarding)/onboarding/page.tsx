import { ButtonContainer } from '@/components/button-container';
import { LinkButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { CheckboxProps } from '@radix-ui/react-checkbox';

import OnboardingLayout, { OnboardingDescription } from '../onboarding-layout';

function CheckboxGroup({
  label,
  description,
  ...props
}: { label: string; description: string } & CheckboxProps) {
  const randId = Math.random().toString(36).substring(7);
  return (
    <label
      className="flex gap-4 py-6 transition-colors hover:bg-slate-100"
      htmlFor={randId}
    >
      <div>
        <Checkbox {...props} id={randId} />
      </div>
      <div>
        <div className="mb-1 mt-0.5 font-medium leading-none">{label}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
    </label>
  );
}

const Tracking = () => {
  return (
    <OnboardingLayout
      title="What do you want to track?"
      description={
        <OnboardingDescription>
          Create your account and start taking control of your data.
        </OnboardingDescription>
      }
    >
      <div className="flex flex-col divide-y">
        <CheckboxGroup
          label="Website"
          description="Track events and conversion for your website"
        />
        <CheckboxGroup
          label="App"
          description="Track events and conversion for your app"
        />
        <CheckboxGroup
          label="Backend"
          description="Track events and conversion for your backend/api"
        />
      </div>

      <ButtonContainer>
        <LinkButton
          href="/onboarding"
          size="lg"
          className="min-w-28 self-start"
          variant={'secondary'}
        >
          Back
        </LinkButton>
        <LinkButton
          href="/onboarding/connect"
          size="lg"
          className="min-w-28 self-start"
        >
          Next
        </LinkButton>
      </ButtonContainer>
    </OnboardingLayout>
  );
};

export default Tracking;
