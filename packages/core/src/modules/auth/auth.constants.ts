// Moved from packages/validation/src/index.ts (ADR-008's module map: auth owns
// "C"). packages/validation/src/index.ts becomes a re-export shim for these
// symbols (same shape as packages/validation/src/cohort.validation.ts since
// M5-003), so apps/start and packages/trpc keep resolving them through
// packages/validation's existing barrel unchanged. `zProvider` is new here — it
// validated `signInOAuth`'s input inline in packages/trpc/src/routers/auth.ts
// and was never exported, but it is vocabulary the same way the rest of this
// file is.
//
// Isomorphic by the AGENTS.md rule: zod and nothing else.

import { z } from 'zod';

export const zProvider = z.enum(['email', 'google', 'github']);

export const zPassword = z.string().min(8);

export const zSignInEmail = z.object({
  email: z.string().email().min(1),
  password: zPassword,
  inviteId: z.string().nullish(),
});
export type ISignInEmail = z.infer<typeof zSignInEmail>;

export const zSignUpEmail = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    password: zPassword,
    confirmPassword: zPassword,
    inviteId: z.string().nullish(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
export type ISignUpEmail = z.infer<typeof zSignUpEmail>;

export const zResetPassword = z.object({
  token: z.string(),
  password: z.string().min(8),
});
export type IResetPassword = z.infer<typeof zResetPassword>;

export const zRequestResetPassword = z.object({
  email: z.string().email(),
});
export type IRequestResetPassword = z.infer<typeof zRequestResetPassword>;

export const zTotpCode = z
  .string()
  .transform((v) => v.replace(/\s+/g, ''))
  .refine((v) => /^\d{6}$/.test(v), { message: 'Enter a 6-digit code' });
export type ITotpCode = z.infer<typeof zTotpCode>;

export const zTotpOrRecoveryCode = z
  .string()
  .min(1)
  .transform((v) => v.trim());
export type ITotpOrRecoveryCode = z.infer<typeof zTotpOrRecoveryCode>;

export const zSignInShare = z.object({
  password: z.string().min(1),
  shareId: z.string().min(1),
  shareType: z
    .enum(['overview', 'dashboard', 'report'])
    .optional()
    .default('overview'),
});
export type ISignInShare = z.infer<typeof zSignInShare>;
