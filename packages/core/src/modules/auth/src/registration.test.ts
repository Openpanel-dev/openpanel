import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ServiceDeps } from '../../../services';
import { getIsRegistrationAllowed } from './registration';

const mockUserCount = mock(async () => 5);
const mockInviteFindUnique = mock(
  async (): Promise<{ id: string } | null> => null
);

const deps = {
  db: {
    user: { count: mockUserCount },
    invite: { findUnique: mockInviteFindUnique },
  },
} as unknown as ServiceDeps;

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockUserCount.mockClear();
  mockInviteFindUnique.mockClear();
  // Not the first user unless a test says otherwise
  mockUserCount.mockResolvedValue(5);
  mockInviteFindUnique.mockResolvedValue(null);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getIsRegistrationAllowed', () => {
  it('allows everything in cloud (ALLOW_REGISTRATION unset)', async () => {
    process.env.ALLOW_REGISTRATION = undefined;
    delete process.env.ALLOW_REGISTRATION;

    expect(await getIsRegistrationAllowed(deps)).toBe(true);
    expect(mockUserCount).not.toHaveBeenCalled();
  });

  it('allows the very first user even when registration is disabled', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    mockUserCount.mockResolvedValue(0);

    expect(await getIsRegistrationAllowed(deps)).toBe(true);
  });

  it('blocks a new user with no invite when registration is disabled', async () => {
    process.env.ALLOW_REGISTRATION = 'false';

    expect(await getIsRegistrationAllowed(deps)).toBe(false);
  });

  it('allows a new user holding a valid invite when registration is disabled', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    process.env.ALLOW_INVITATION = 'true';
    mockInviteFindUnique.mockResolvedValue({ id: 'invite-1' });

    expect(await getIsRegistrationAllowed(deps, 'invite-1')).toBe(true);
  });

  it('blocks an unknown invite id', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    process.env.ALLOW_INVITATION = 'true';
    mockInviteFindUnique.mockResolvedValue(null);

    expect(await getIsRegistrationAllowed(deps, 'nope')).toBe(false);
  });

  it('blocks a valid invite when invitations are disabled', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    process.env.ALLOW_INVITATION = 'false';
    mockInviteFindUnique.mockResolvedValue({ id: 'invite-1' });

    expect(await getIsRegistrationAllowed(deps, 'invite-1')).toBe(false);
    expect(mockInviteFindUnique).not.toHaveBeenCalled();
  });

  it('allows open self-hosted registration', async () => {
    process.env.ALLOW_REGISTRATION = 'true';

    expect(await getIsRegistrationAllowed(deps)).toBe(true);
  });
});
