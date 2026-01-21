import React from 'react';
import { Resend } from 'resend';
import type { z } from 'zod';

import { db } from '@openpanel/db';
import { type TemplateKey, type Templates, templates } from './emails';
import { getUnsubscribeUrl } from './unsubscribe';

export * from './unsubscribe';

const FROM = process.env.EMAIL_SENDER ?? 'hello@openpanel.dev';

export type EmailData<T extends TemplateKey> = z.infer<Templates[T]['schema']>;
export type EmailTemplate = keyof Templates;

export async function sendEmail<T extends TemplateKey>(
  templateKey: T,
  options: {
    to: string;
    data: z.infer<Templates[T]['schema']>;
  },
) {
  const { to, data } = options;
  const template = templates[templateKey];
  const props = template.schema.safeParse(data);

  if (!props.success) {
    console.error('Failed to parse data', props.error);
    return null;
  }

  if ('category' in template && template.category) {
    const unsubscribed = await db.emailUnsubscribe.findUnique({
      where: {
        email_category: {
          email: to,
          category: template.category,
        },
      },
    });

    if (unsubscribed) {
      console.log(
        `Skipping email to ${to} - unsubscribed from ${template.category}`,
      );
      return null;
    }
  }

  if (!process.env.RESEND_API_KEY) {
    console.log('No RESEND_API_KEY found, here is the data');
    console.log('Template:', template);
    console.log('Subject: ', template.subject(props.data as any));
    console.log('To:      ', to);
    console.log('Data:    ', JSON.stringify(data, null, 2));
    return null;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const headers: Record<string, string> = {};
  if ('category' in template && template.category) {
    const unsubscribeUrl = getUnsubscribeUrl(to, template.category);
    (data as any).unsubscribeUrl = unsubscribeUrl;
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  try {
    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: template.subject(props.data as any),
      react: <template.Component {...(props.data as any)} />,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
    if (res.error) {
      throw new Error(res.error.message);
    }
    return res;
  } catch (error) {
    console.error('Failed to send email', error);
    return null;
  }
}
