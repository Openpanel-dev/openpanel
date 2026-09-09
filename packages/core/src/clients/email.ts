// @openpanel/email stays its own package — the react-email JSX toolchain
// doesn't belong in core (TARGET_ARCHITECTURE §7: "email (react-email JSX
// stays out of core; core wraps it as clients/email)").
//
// Loaded lazily, deliberately: @openpanel/email depends on @openpanel/db
// (to check email-unsubscribe rows before sending), and @openpanel/db still
// depends on @openpanel/core for shared crypto/logging utilities that
// haven't moved yet (mid-P4 state). A static top-level import here would
// make core's own barrel eagerly load @openpanel/db while core is still
// mid-evaluation — the cycle resolves core's own exports as undefined partway
// through. Deferring the import to call time sidesteps it: by the time
// anything actually sends an email, core has finished loading.
//
// No `ProviderError` (ADR-022 R19): `@openpanel/email` swallows every Resend
// and SMTP failure itself and returns `null`, so nothing reaches this wrapper
// to classify. Classifying it means changing that package, which is outside
// this seam.

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
