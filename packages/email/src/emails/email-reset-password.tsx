import React from 'react';
import { Button, Link, Text } from '@react-email/components';
import { z } from 'zod';
import { Layout } from '../components/layout';

export const zEmailResetPassword = z.object({
  url: z.string(),
});

export type Props = z.infer<typeof zEmailResetPassword>;
export default EmailResetPassword;
export function EmailResetPassword({ url = 'https://openpanel.dev' }: Props) {
  return (
    <Layout>
      <Text>
        You have requested to reset your password. Follow the link below to
        reset your password:
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
        Reset password
      </Button>
      <Text>
        Reset password link: <Link href={url}>{url}</Link>
      </Text>
      <Text style={{ color: '#666' }}>
        Have you not requested this? Please ignore this email and contact
        support if you believe this was a mistake.
      </Text>
    </Layout>
  );
}
