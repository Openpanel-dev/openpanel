import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  findUnsubscribe: vi.fn(),
  render: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  resendConstructor: vi.fn(),
  resendSend: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@openpanel/db', () => ({
  db: { emailUnsubscribe: { findUnique: io.findUnsubscribe } },
}));
vi.mock('@react-email/render', () => ({ render: io.render }));
vi.mock('nodemailer', () => ({ createTransport: io.createTransport }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: io.resendSend };
    constructor(key: string) {
      io.resendConstructor(key);
    }
  },
}));

const TO = 'alex.f08@example.invalid';
const MASKED_TO = 'a***@example.invalid';
const FROM = 'sender-f08@example.invalid';
const RESET_TOKEN = 'synthetic-reset-token-f08';
const RESET_URL = `https://dashboard.invalid/reset-password?token=${RESET_TOKEN}`;
const HTML = `<p>synthetic-email-body-f08 ${RESET_URL}</p>`;
const SECRET = 'synthetic-unsubscribe-secret-f08';
const SMTP_PASSWORD = 'synthetic-smtp-password-f08';
const RESEND_KEY = 'synthetic-resend-key-f08';
const PROVIDER_MESSAGE = `synthetic-provider-error-f08 ${TO} ${RESET_URL}`;
const SMTP_RESULT = { messageId: 'synthetic-smtp-id-f08' };
const RESEND_RESULT = { data: { id: 'synthetic-resend-id-f08' }, error: null };
const EMAIL_ENV = [
  'EMAIL_SENDER',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'RESEND_API_KEY',
  'UNSUBSCRIBE_SECRET',
  'COOKIE_SECRET',
  'DASHBOARD_URL',
] as const;

let email: typeof import('./index');
let protectedMarkers: string[];

function resetOptions() {
  return { to: TO, data: { url: RESET_URL } };
}

function onboardingOptions() {
  return {
    to: TO,
    data: {
      firstName: 'synthetic-first-name-f08',
      dashboardUrl: 'https://dashboard.invalid/synthetic-organization-f08',
      hasData: false,
    },
  };
}

function configureSmtp() {
  vi.stubEnv('SMTP_HOST', 'smtp.invalid');
  vi.stubEnv('SMTP_USER', 'synthetic-smtp-user-f08');
  vi.stubEnv('SMTP_PASS', SMTP_PASSWORD);
}

beforeEach(async () => {
  vi.resetModules();
  for (const key of EMAIL_ENV) {
    vi.stubEnv(key, undefined);
  }
  vi.stubEnv('EMAIL_SENDER', FROM);
  vi.stubEnv('UNSUBSCRIBE_SECRET', SECRET);
  vi.stubEnv('DASHBOARD_URL', 'https://dashboard.invalid');
  protectedMarkers = [
    TO,
    RESET_TOKEN,
    RESET_URL,
    HTML,
    SECRET,
    SMTP_PASSWORD,
    RESEND_KEY,
    'synthetic-first-name-f08',
    'synthetic-organization-f08',
    'synthetic-provider-error-f08',
  ];
  for (const mock of Object.values(io)) {
    mock.mockReset();
  }
  io.findUnsubscribe.mockResolvedValue(null);
  io.render.mockResolvedValue(HTML);
  io.createTransport.mockReturnValue({ sendMail: io.sendMail });
  io.sendMail.mockResolvedValue(SMTP_RESULT);
  io.resendSend.mockResolvedValue(RESEND_RESULT);
  vi.spyOn(console, 'log').mockImplementation(io.log);
  vi.spyOn(console, 'warn').mockImplementation(io.warn);
  vi.spyOn(console, 'error').mockImplementation(io.error);
  email = await import('./index');
});

afterEach(() => {
  try {
    // inspect includes Error.message/stack; JSON.stringify would hide them.
    const output = inspect(
      [io.log.mock.calls, io.warn.mock.calls, io.error.mock.calls],
      { depth: null }
    );
    if (protectedMarkers.some((marker) => output.includes(marker))) {
      throw new Error('A synthetic protected value appeared in email logs');
    }
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

describe('email log protection and delivery contracts', () => {
  it('returns null for invalid template data without logging its validation error', async () => {
    const result = await email.sendEmail('reset-password', {
      to: TO,
      data: { url: { token: RESET_TOKEN } } as never,
    });
    expect(result).toBeNull();
    expect(io.error).toHaveBeenCalledExactlyOnceWith(
      'Failed to parse email data',
      { templateKey: 'reset-password', reason: 'invalid_template_data' }
    );
    expect(io.findUnsubscribe).not.toHaveBeenCalled();
    expect(io.render).not.toHaveBeenCalled();
    expect(io.resendConstructor).not.toHaveBeenCalled();
  });

  it('skips an unsubscribed recipient without rendering or sending', async () => {
    io.findUnsubscribe.mockResolvedValue({ id: 'synthetic-opt-out-f08' });
    expect(
      await email.sendEmail('onboarding-welcome', onboardingOptions())
    ).toBeNull();
    expect(io.findUnsubscribe).toHaveBeenCalledExactlyOnceWith({
      where: { email_category: { email: TO, category: 'onboarding' } },
    });
    expect(io.log).toHaveBeenCalledExactlyOnceWith('Email delivery skipped', {
      templateKey: 'onboarding-welcome',
      to: MASKED_TO,
      category: 'onboarding',
      reason: 'unsubscribed',
    });
    expect(io.render).not.toHaveBeenCalled();
    expect(io.createTransport).not.toHaveBeenCalled();
    expect(io.resendConstructor).not.toHaveBeenCalled();
  });

  it('warns with a fixed reason when neither provider is configured', async () => {
    expect(await email.sendEmail('reset-password', resetOptions())).toBeNull();
    expect(io.warn).toHaveBeenCalledExactlyOnceWith('Email delivery skipped', {
      templateKey: 'reset-password',
      to: MASKED_TO,
      reason: 'resend_api_key_missing',
    });
    expect(io.findUnsubscribe).not.toHaveBeenCalled();
    expect(io.createTransport).not.toHaveBeenCalled();
    expect(io.resendConstructor).not.toHaveBeenCalled();
  });

  it('keeps classified mail data out of the missing-provider warning', async () => {
    expect(
      await email.sendEmail('onboarding-welcome', onboardingOptions())
    ).toBeNull();
    expect(io.warn).toHaveBeenCalledExactlyOnceWith('Email delivery skipped', {
      templateKey: 'onboarding-welcome',
      to: MASKED_TO,
      reason: 'resend_api_key_missing',
    });
    expect(io.findUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('prefers SMTP and sends the original recipient, subject and body', async () => {
    configureSmtp();
    vi.stubEnv('RESEND_API_KEY', RESEND_KEY);
    expect(await email.sendEmail('reset-password', resetOptions())).toBe(
      SMTP_RESULT
    );
    expect(io.sendMail).toHaveBeenCalledExactlyOnceWith({
      from: FROM,
      to: TO,
      subject: 'Reset your password',
      html: HTML,
      headers: {},
    });
    expect(io.render.mock.calls[0]?.[0].props.url).toBe(RESET_URL);
    expect(io.resendConstructor).not.toHaveBeenCalled();
    expect(io.log).not.toHaveBeenCalled();
    expect(io.warn).not.toHaveBeenCalled();
    expect(io.error).not.toHaveBeenCalled();
  });

  it('retains authenticated SMTP STARTTLS, default port and timeouts', async () => {
    configureSmtp();
    await email.sendEmail('reset-password', resetOptions());
    expect(io.createTransport).toHaveBeenCalledExactlyOnceWith({
      host: 'smtp.invalid',
      port: 587,
      secure: false,
      auth: { user: 'synthetic-smtp-user-f08', pass: SMTP_PASSWORD },
      requireTLS: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  });

  it('retains implicit TLS and an explicit port', async () => {
    configureSmtp();
    vi.stubEnv('SMTP_SECURE', 'true');
    vi.stubEnv('SMTP_PORT', '465');
    await email.sendEmail('reset-password', resetOptions());
    expect(io.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true, requireTLS: false })
    );
  });

  it('does not require STARTTLS for the existing unauthenticated relay mode', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.invalid');
    await email.sendEmail('reset-password', resetOptions());
    expect(io.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: undefined,
        secure: false,
        requireTLS: false,
      })
    );
  });

  for (const boundary of ['render', 'createTransport', 'sendMail'] as const) {
    it(`returns null and a fixed SMTP reason when ${boundary} fails`, async () => {
      configureSmtp();
      const failure = new Error(PROVIDER_MESSAGE);
      if (boundary === 'createTransport') {
        io.createTransport.mockImplementation(() => {
          throw failure;
        });
      } else {
        io[boundary].mockRejectedValue(failure);
      }
      expect(
        await email.sendEmail('reset-password', resetOptions())
      ).toBeNull();
      expect(io.error).toHaveBeenCalledExactlyOnceWith(
        'Email delivery failed',
        {
          templateKey: 'reset-password',
          to: MASKED_TO,
          reason: 'smtp_provider_error',
        }
      );
      expect(io.render).toHaveBeenCalledTimes(1);
      expect(io.createTransport).toHaveBeenCalledTimes(
        boundary === 'render' ? 0 : 1
      );
      expect(io.sendMail).toHaveBeenCalledTimes(
        boundary === 'sendMail' ? 1 : 0
      );
      expect(io.resendConstructor).not.toHaveBeenCalled();
    });
  }

  for (const kind of ['returned-error', 'thrown-error'] as const) {
    it(`returns null and a fixed Resend reason for a ${kind}`, async () => {
      vi.stubEnv('RESEND_API_KEY', RESEND_KEY);
      if (kind === 'returned-error') {
        io.resendSend.mockResolvedValue({
          error: { message: PROVIDER_MESSAGE },
        });
      } else {
        io.resendSend.mockRejectedValue(new Error(PROVIDER_MESSAGE));
      }
      expect(
        await email.sendEmail('reset-password', resetOptions())
      ).toBeNull();
      expect(io.error).toHaveBeenCalledExactlyOnceWith(
        'Email delivery failed',
        {
          templateKey: 'reset-password',
          to: MASKED_TO,
          reason: 'provider_error',
        }
      );
      expect(io.resendConstructor).toHaveBeenCalledExactlyOnceWith(RESEND_KEY);
      expect(io.resendSend).toHaveBeenCalledTimes(1);
    });
  }

  it('preserves Resend success and the original transactional message', async () => {
    vi.stubEnv('RESEND_API_KEY', RESEND_KEY);
    expect(await email.sendEmail('reset-password', resetOptions())).toBe(
      RESEND_RESULT
    );
    expect(io.resendConstructor).toHaveBeenCalledExactlyOnceWith(RESEND_KEY);
    expect(io.resendSend).toHaveBeenCalledExactlyOnceWith({
      from: FROM,
      to: TO,
      subject: 'Reset your password',
      react: expect.objectContaining({ props: { url: RESET_URL } }),
      headers: undefined,
    });
    expect(io.findUnsubscribe).not.toHaveBeenCalled();
    expect(io.error).not.toHaveBeenCalled();
    expect(io.warn).not.toHaveBeenCalled();
    expect(io.log).not.toHaveBeenCalled();
  });

  for (const provider of ['smtp', 'resend'] as const) {
    it(`preserves invitation content and skips marketing opt-out for ${provider}`, async () => {
      const inviteUrl =
        'https://dashboard.invalid/onboarding?inviteId=synthetic-invite-f08';
      const organizationName = 'synthetic-invitation-organization-f08';
      protectedMarkers.push(
        inviteUrl,
        'synthetic-invite-f08',
        organizationName
      );
      if (provider === 'smtp') {
        configureSmtp();
      } else {
        vi.stubEnv('RESEND_API_KEY', RESEND_KEY);
      }
      const result = await email.sendEmail('invite', {
        to: TO,
        data: { url: inviteUrl, organizationName },
      });
      expect(result).toBe(provider === 'smtp' ? SMTP_RESULT : RESEND_RESULT);
      const request =
        provider === 'smtp'
          ? io.sendMail.mock.calls[0]?.[0]
          : io.resendSend.mock.calls[0]?.[0];
      expect(request.to).toBe(TO);
      expect(request.subject).toBe(`Invite to join ${organizationName}`);
      const component =
        provider === 'smtp' ? io.render.mock.calls[0]?.[0] : request.react;
      expect(component.props).toEqual({ url: inviteUrl, organizationName });
      expect(io.findUnsubscribe).not.toHaveBeenCalled();
      expect(io.error).not.toHaveBeenCalled();
      expect(io.warn).not.toHaveBeenCalled();
      expect(io.log).not.toHaveBeenCalled();
    });

    it(`keeps signed unsubscribe links and headers for classified ${provider} mail`, async () => {
      if (provider === 'smtp') {
        configureSmtp();
      } else {
        vi.stubEnv('RESEND_API_KEY', RESEND_KEY);
      }
      await email.sendEmail('onboarding-welcome', onboardingOptions());
      const request =
        provider === 'smtp'
          ? io.sendMail.mock.calls[0]?.[0]
          : io.resendSend.mock.calls[0]?.[0];
      expect(request.to).toBe(TO);
      expect(request.headers['List-Unsubscribe-Post']).toBe(
        'List-Unsubscribe=One-Click'
      );
      const signedUrl = request.headers['List-Unsubscribe'].slice(1, -1);
      const url = new URL(signedUrl);
      const token = url.searchParams.get('token');
      expect(url.origin).toBe('https://dashboard.invalid');
      expect(url.pathname).toBe('/unsubscribe');
      expect(url.searchParams.get('email')).toBe(TO);
      expect(url.searchParams.get('category')).toBe('onboarding');
      expect(token).toBeTypeOf('string');
      protectedMarkers.push(signedUrl, token as string);
      expect(
        email.verifyUnsubscribeToken(TO, 'onboarding', token as string)
      ).toBe(true);
      const component =
        provider === 'smtp' ? io.render.mock.calls[0]?.[0] : request.react;
      expect(component.props.unsubscribeUrl).toBe(signedUrl);
      expect(io.error).not.toHaveBeenCalled();
      expect(io.warn).not.toHaveBeenCalled();
      expect(io.log).not.toHaveBeenCalled();
    });
  }

  it('preserves missing signing-secret rejection outside the delivery catch', async () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', undefined);
    vi.stubEnv('COOKIE_SECRET', undefined);
    await expect(
      email.sendEmail('onboarding-welcome', onboardingOptions())
    ).rejects.toThrow('UNSUBSCRIBE_SECRET or COOKIE_SECRET must be set');
    expect(io.createTransport).not.toHaveBeenCalled();
    expect(io.resendConstructor).not.toHaveBeenCalled();
    expect(io.error).not.toHaveBeenCalled();
  });

  it('preserves unsubscribe-query rejection outside the delivery catch', async () => {
    const failure = new Error(PROVIDER_MESSAGE);
    io.findUnsubscribe.mockRejectedValue(failure);
    await expect(
      email.sendEmail('onboarding-welcome', onboardingOptions())
    ).rejects.toBe(failure);
    expect(io.error).not.toHaveBeenCalled();
  });

  it('preserves Resend-constructor rejection outside the delivery catch', async () => {
    vi.stubEnv('RESEND_API_KEY', RESEND_KEY);
    const failure = new Error(PROVIDER_MESSAGE);
    io.resendConstructor.mockImplementation(() => {
      throw failure;
    });
    await expect(
      email.sendEmail('reset-password', resetOptions())
    ).rejects.toBe(failure);
    expect(io.error).not.toHaveBeenCalled();
  });
});
