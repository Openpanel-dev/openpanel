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
