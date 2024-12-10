import React from 'react';
import { Button, Link, Text } from '@react-email/components';
import { z } from 'zod';
import { Layout } from '../components/layout';

export const zEmailInvite = z.object({
  url: z.string(),
  organizationName: z.string(),
});

export type Props = z.infer<typeof zEmailInvite>;
export default EmailInvite;
export function EmailInvite({
  organizationName = 'Acme Co',
  url = 'https://openpanel.dev',
}: Props) {
  return (
    <Layout>
      <Text>You've been invited to join {organizationName}!</Text>
      <Text>
        If you don't have an account yet, click the button below to create one
        and join the organization:
      </Text>
      <Button
        href={url}
        style={{
          backgroundColor: '#000',
          borderRadius: '6px',
          color: '#fff',
          padding: '12px 20px',
          textDecoration: 'none',
        }}
      >
        Join {organizationName}
      </Button>
      <Text>
        Join link: <Link href={url}>{url}</Link>
      </Text>
      <Text style={{ color: '#666' }}>
        Already have an account? No need to do anything - you'll have access
        automatically when you sign in.
      </Text>
    </Layout>
  );
}
