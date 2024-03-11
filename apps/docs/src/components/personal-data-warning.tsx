import { Callout } from 'nextra/components';

export function PersonalDataWarning() {
  return (
    <Callout emoji="⚠️">
      Keep in mind that this is considered personal data. Make sure you have the
      users consent before calling this!
    </Callout>
  );
}
