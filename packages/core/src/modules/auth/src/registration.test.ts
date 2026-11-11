import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { testCoreConfig } from '../../../../test/config-fixture';
import type { ServiceDeps } from '../../../services';
import {
  getIsRegistrationAllowed,
  getIsUserCreationAllowed,
} from './registration';

const HOUR_MS = 60 * 60 * 1000;
const EXISTING_USER = { id: 'user_1' };
const mockFirstUser = mock(
  async (): Promise<{ id: string } | null> => EXISTING_USER
);
const mockInviteFindUnique = mock(
  async (): Promise<{ id: string; expiresAt: Date } | null> => null
);

/**
 * ALLOW_REGISTRATION / ALLOW_INVITATION arrive as `config.auth`, where
 * `undefined` is "unset" (cloud) and the loader has already resolved the
 * `!== 'false'` reading.
 */
function depsWith(auth: {
  allowRegistration?: boolean;
  allowInvitation?: boolean;
  allowRegistrationDomains?: string[];
}): ServiceDeps {
  const base = testCoreConfig();
  return {
    db: {
      user: { findFirst: mockFirstUser },
      invite: { findUnique: mockInviteFindUnique },
    },
    config: testCoreConfig({ auth: { ...base.auth, ...auth } }),
  } as unknown as ServiceDeps;
}

beforeEach(() => {
  mockFirstUser.mockClear();
  mockInviteFindUnique.mockClear();
  // Not the first user unless a test says otherwise
  mockFirstUser.mockResolvedValue(EXISTING_USER);
  mockInviteFindUnique.mockResolvedValue(null);
});

describe('getIsRegistrationAllowed', () => {
  it('allows everything in cloud (ALLOW_REGISTRATION unset)', async () => {
    expect(await getIsRegistrationAllowed(depsWith({}))).toBe(true);
    expect(mockFirstUser).not.toHaveBeenCalled();
  });

  it('allows the very first user even when registration is disabled', async () => {
    mockFirstUser.mockResolvedValue(null);

    expect(
      await getIsRegistrationAllowed(depsWith({ allowRegistration: false }))
    ).toBe(true);
  });

  it('blocks a new user with no invite when registration is disabled', async () => {
    expect(
      await getIsRegistrationAllowed(depsWith({ allowRegistration: false }))
    ).toBe(false);
  });

  it('allows a new user holding a valid invite when registration is disabled', async () => {
    mockInviteFindUnique.mockResolvedValue({
      id: 'invite-1',
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    expect(
      await getIsRegistrationAllowed(
        depsWith({ allowRegistration: false, allowInvitation: true }),
        'invite-1'
      )
    ).toBe(true);
  });

  it('blocks an expired invite', async () => {
    mockInviteFindUnique.mockResolvedValue({
      id: 'invite-1',
      expiresAt: new Date(Date.now() - HOUR_MS),
    });

    expect(
      await getIsRegistrationAllowed(
        depsWith({ allowRegistration: false, allowInvitation: true }),
        'invite-1'
      )
    ).toBe(false);
  });

  it('blocks an unknown invite id', async () => {
    mockInviteFindUnique.mockResolvedValue(null);

    expect(
      await getIsRegistrationAllowed(
        depsWith({ allowRegistration: false, allowInvitation: true }),
        'nope'
      )
    ).toBe(false);
  });

  it('blocks a valid invite when invitations are disabled', async () => {
    mockInviteFindUnique.mockResolvedValue({
      id: 'invite-1',
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    expect(
      await getIsRegistrationAllowed(
        depsWith({ allowRegistration: false, allowInvitation: false }),
        'invite-1'
      )
    ).toBe(false);
    expect(mockInviteFindUnique).not.toHaveBeenCalled();
  });

  it('allows open self-hosted registration', async () => {
    expect(
      await getIsRegistrationAllowed(depsWith({ allowRegistration: true }))
    ).toBe(true);
  });

  it('refuses a NUL in an invite id without asking the database', async () => {
    expect(
      await getIsRegistrationAllowed(
        depsWith({ allowRegistration: false, allowInvitation: true }),
        'inv\0ite'
      )
    ).toBe(false);
    expect(mockInviteFindUnique).not.toHaveBeenCalled();
  });

  describe('ALLOW_REGISTRATION_DOMAINS', () => {
    const restricted = {
      allowRegistration: true,
      allowRegistrationDomains: ['acme.com', 'example.org'],
    };

    it('allows a new user on a listed domain', async () => {
      expect(
        await getIsUserCreationAllowed(
          depsWith(restricted),
          undefined,
          'jane@example.org'
        )
      ).toBe(true);
    });

    it('matches the domain case-insensitively', async () => {
      expect(
        await getIsUserCreationAllowed(
          depsWith(restricted),
          undefined,
          'Jane@ACME.com'
        )
      ).toBe(true);
    });

    it('blocks a new user on any other domain', async () => {
      expect(
        await getIsUserCreationAllowed(
          depsWith(restricted),
          undefined,
          'jane@gmail.com'
        )
      ).toBe(false);
    });

    it('does not admit subdomains or lookalikes', async () => {
      for (const email of [
        'jane@eu.acme.com',
        'jane@notacme.com',
        'jane@acme.com.evil.io',
        'acme.com',
      ]) {
        expect(
          await getIsUserCreationAllowed(depsWith(restricted), undefined, email)
        ).toBe(false);
      }
    });

    it('blocks user creation when no email is known', async () => {
      expect(
        await getIsUserCreationAllowed(depsWith(restricted), undefined, null)
      ).toBe(false);
    });

    it('still offers sign-up before an email is known', async () => {
      expect(await getIsRegistrationAllowed(depsWith(restricted))).toBe(true);
    });

    it('applies when ALLOW_REGISTRATION is unset', async () => {
      const deps = depsWith({ allowRegistrationDomains: ['acme.com'] });

      expect(
        await getIsUserCreationAllowed(deps, undefined, 'jane@acme.com')
      ).toBe(true);
      expect(
        await getIsUserCreationAllowed(deps, undefined, 'jane@gmail.com')
      ).toBe(false);
    });

    it('does not reopen registration that is disabled', async () => {
      expect(
        await getIsUserCreationAllowed(
          depsWith({ ...restricted, allowRegistration: false }),
          undefined,
          'jane@acme.com'
        )
      ).toBe(false);
    });

    it('still allows the very first user on any domain', async () => {
      mockFirstUser.mockResolvedValue(null);

      expect(
        await getIsUserCreationAllowed(
          depsWith(restricted),
          undefined,
          'jane@gmail.com'
        )
      ).toBe(true);
    });

    it('lets a valid invite through from any domain', async () => {
      mockInviteFindUnique.mockResolvedValue({
        id: 'invite-1',
        expiresAt: new Date(Date.now() + HOUR_MS),
      });

      expect(
        await getIsUserCreationAllowed(
          depsWith(restricted),
          'invite-1',
          'contractor@gmail.com'
        )
      ).toBe(true);
    });
  });
});
