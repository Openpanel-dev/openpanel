import { z } from 'zod';
import {
  MAX_EMAIL,
  MAX_ID,
  MAX_NAME,
  MAX_PASSWORD,
  MAX_TOKEN,
} from '../../shared/limits.constants';

export const zProvider = z.enum(['email', 'google', 'github']);

/** A password hash we no longer verify (Clerk's bcrypt); only a reset fixes it. */
export const PASSWORD_RESET_REQUIRED = 'PASSWORD_RESET_REQUIRED';

/** Carries an invite through an email sign-in or sign-up to `/api/auth`. */
export const INVITE_HEADER = 'x-openpanel-invite';

/**
 * `hashPassword` hands this straight to argon2, so the ceiling is what stops a
 * caller choosing how much work the server does. 128 is far above any password
 * a person types; anyone who set a longer one before this existed resets by
 * email, which asks only for an address.
 */
export const zPassword = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(MAX_PASSWORD);

/** Length first, so a huge string fails before the address is parsed. */
const zEmail = z.string().max(MAX_EMAIL).email();

/** An id we generated or a provider handed back. `inviteId` reaches a cookie. */
const zShortId = z.string().max(MAX_ID);

/** Trimmed first, so a whitespace-only name fails `min(1)` rather than storing. */
const zPersonName = z.string().trim().min(1).max(MAX_NAME);

export const zSignInEmail = z.object({
  email: zEmail.min(1),
  password: zPassword,
});
export type ISignInEmail = z.infer<typeof zSignInEmail>;

export const zSignInDev = z.object({ inviteId: zShortId.nullish() });

export const zSignUpEmail = z.object({
  firstName: zPersonName,
  lastName: zPersonName,
  email: zEmail,
  password: zPassword,
});
export type ISignUpEmail = z.infer<typeof zSignUpEmail>;

export const zResetPassword = z.object({
  token: z.string().max(MAX_TOKEN),
  password: zPassword,
});
export type IResetPassword = z.infer<typeof zResetPassword>;

export const zRequestResetPassword = z.object({
  email: zEmail,
});
export type IRequestResetPassword = z.infer<typeof zRequestResetPassword>;

export const zTotpCode = z
  .string()
  .max(MAX_TOKEN)
  .transform((v) => v.replace(/\s+/g, ''))
  .refine((v) => /^\d{6}$/.test(v), { message: 'Enter a 6-digit code' });
export type ITotpCode = z.infer<typeof zTotpCode>;

export const zSignInShare = z.object({
  password: z.string().min(1).max(MAX_PASSWORD),
  shareId: zShortId.min(1),
  shareType: z
    .enum(['overview', 'dashboard', 'report'])
    .optional()
    .default('overview'),
});
export type ISignInShare = z.infer<typeof zSignInShare>;
