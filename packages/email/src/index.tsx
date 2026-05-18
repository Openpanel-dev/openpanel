import React from 'react';
import { render } from '@react-email/render';
import { createTransport } from 'nodemailer';
import { Resend } from 'resend';
import type { z } from 'zod';

import { db } from '@openpanel/db';
import { type TemplateKey, type Templates, templates } from './emails';
import { getUnsubscribeUrl } from './unsubscribe';

export * from './unsubscribe';

const FROM = process.env.EMAIL_SENDER ?? 'hello@openpanel.dev';

export type EmailData<T extends TemplateKey> = z.infer<Templates[T]['schema']>;
export type EmailTemplate = keyof Templates;

function createSmtpTransport() {
  return createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

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

  const headers: Record<string, string> = {};
  if ('category' in template && template.category) {
    const unsubscribeUrl = getUnsubscribeUrl(to, template.category);
    (props.data as any).unsubscribeUrl = unsubscribeUrl;
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  const subject = template.subject(props.data as any);

  if (process.env.SMTP_HOST) {
    try {
      const html = await render(
        <template.Component {...(props.data as any)} />,
      );
      const transport = createSmtpTransport();
      const res = await transport.sendMail({
        from: FROM,
        to,
        subject,
        html,
        headers,
      });
      return res;
    } catch (error) {
      console.error('Failed to send email via SMTP', error);
      return null;
    }
  }

  if (!process.env.RESEND_API_KEY) {
    console.log('No SMTP_HOST or RESEND_API_KEY found, here is the data');
    console.log('Template:', template);
    console.log('Subject: ', subject);
    console.log('To:      ', to);
    console.log('Data:    ', JSON.stringify(data, null, 2));
    return null;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const res = await resend.emails.send({
      from: FROM,
      to,
      subject,
      react: <template.Component {...(props.data as any)} />,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
    if (res.error) {
      throw new Error(res.error.message);
    }
    return res;
  } catch (error) {
    console.error('Failed to send email via Resend', error);
    return null;
  }
}
