import React from 'react';
import { Resend } from 'resend';
import type { z } from 'zod';

import { type TemplateKey, type Templates, templates } from './emails';

const FROM = 'hello@openpanel.dev';

export async function sendEmail<T extends TemplateKey>(
  template: T,
  options: {
    to: string | string[];
    data: z.infer<Templates[T]['schema']>;
  },
) {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { to, data } = options;
  const { subject, Component, schema } = templates[template];
  const props = schema.safeParse(data);

  if (props.error) {
    console.error('Failed to parse data', props.error);
    return null;
  }

  try {
    const res = await resend.emails.send({
      from: FROM,
      to,
      // @ts-expect-error - TODO: fix this
      subject: subject(props.data),
      // @ts-expect-error - TODO: fix this
      react: <Component {...props.data} />,
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
