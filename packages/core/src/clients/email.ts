// Loaded lazily: @openpanel/email depends on @openpanel/db, which depends on
// @openpanel/core, so a static import would make core's barrel load
// @openpanel/db mid-evaluation and resolve core's own exports as undefined.
//
// No `ProviderError`: `@openpanel/email` swallows every Resend and SMTP failure
// and returns `null`, so nothing reaches this wrapper to classify.

import type { EmailData, EmailTemplate } from '@openpanel/email';

export type { EmailData, EmailTemplate } from '@openpanel/email';

export async function sendEmail<T extends EmailTemplate>(
  templateKey: T,
  options: {
    to: string;
    data: EmailData<T>;
  }
) {
  const { sendEmail: send } = await import('@openpanel/email');
  return send(templateKey, options);
}
