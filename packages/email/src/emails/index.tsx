import type { z } from 'zod';
import { EmailInvite, zEmailInvite } from './email-invite';
import EmailResetPassword, {
  zEmailResetPassword,
} from './email-reset-password';

export const templates = {
  invite: {
    subject: (data: z.infer<typeof zEmailInvite>) =>
      `Invite to join ${data.organizationName}`,
    Component: EmailInvite,
    schema: zEmailInvite,
  },
  'reset-password': {
    subject: (data: z.infer<typeof zEmailResetPassword>) =>
      'Reset your password',
    Component: EmailResetPassword,
    schema: zEmailResetPassword,
  },
} as const;

export type Templates = typeof templates;
export type TemplateKey = keyof Templates;
