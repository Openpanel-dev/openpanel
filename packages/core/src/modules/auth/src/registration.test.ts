import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { testCoreConfig } from '../../../../test/config-fixture';
import type { ServiceDeps } from '../../../services';
import { getIsRegistrationAllowed } from './registration';

const mockUserCount = mock(async () => 5);
const mockInviteFindUnique = mock(
  async (): Promise<{ id: string } | null> => null
);

/**
 * ALLOW_REGISTRATION / ALLOW_INVITATION arrive as `config.auth`, where
 * `undefined` is "unset" (cloud) and the loader has already resolved the
 * `!== 'false'` reading.
 */
function depsWith(auth: {
  allowRegistration?: boolean;
  allowInvitation?: boolean;
}): ServiceDeps {
  const base = testCoreConfig();
  return {
    db: {
      user: { count: mockUserCount },
      invite: { findUnique: mockInviteFindUnique },
    },
    config: testCoreConfig({ auth: { ...base.auth, ...auth } }),
  } as unknown as ServiceDeps;
}

beforeEach(() => {
  mockUserCount.mockClear();
  mockInviteFindUnique.mockClear();
  // Not the first user unless a test says otherwise
  mockUserCount.mockResolvedValue(5);
  mockInviteFindUnique.mockResolvedValue(null);
});

describe('getIsRegistrationAllowed', () => {
  it('allows everything in cloud (ALLOW_REGISTRATION unset)', async () => {
    expect(await getIsRegistrationAllowed(depsWith({}))).toBe(true);
    expect(mockUserCount).not.toHaveBeenCalled();
  });

  it('allows the very first user even when registration is disabled', async () => {
    mockUserCount.mockResolvedValue(0);

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
    mockInviteFindUnique.mockResolvedValue({ id: 'invite-1' });

    expect(
      await getIsRegistrationAllowed(
        depsWith({ allowRegistration: false, allowInvitation: true }),
        'invite-1'
      )
    ).toBe(true);
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
    mockInviteFindUnique.mockResolvedValue({ id: 'invite-1' });

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
});
