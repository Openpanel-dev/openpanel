import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUserCount = vi.hoisted(() => vi.fn());
const mockInviteFindUnique = vi.hoisted(() => vi.fn());

vi.mock('../prisma-client', () => ({
  db: {
    user: { count: mockUserCount },
    invite: { findUnique: mockInviteFindUnique },
  },
}));

import { getIsRegistrationAllowed } from './registration.service';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
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

    await expect(getIsRegistrationAllowed()).resolves.toBe(true);
    expect(mockUserCount).not.toHaveBeenCalled();
  });

  it('allows the very first user even when registration is disabled', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    mockUserCount.mockResolvedValue(0);

    await expect(getIsRegistrationAllowed()).resolves.toBe(true);
  });

  it('blocks a new user with no invite when registration is disabled', async () => {
    process.env.ALLOW_REGISTRATION = 'false';

    await expect(getIsRegistrationAllowed()).resolves.toBe(false);
  });

  it('allows a new user holding a valid invite when registration is disabled', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    process.env.ALLOW_INVITATION = 'true';
    mockInviteFindUnique.mockResolvedValue({ id: 'invite-1' });

    await expect(getIsRegistrationAllowed('invite-1')).resolves.toBe(true);
  });

  it('blocks an unknown invite id', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    process.env.ALLOW_INVITATION = 'true';
    mockInviteFindUnique.mockResolvedValue(null);

    await expect(getIsRegistrationAllowed('nope')).resolves.toBe(false);
  });

  it('blocks a valid invite when invitations are disabled', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    process.env.ALLOW_INVITATION = 'false';
    mockInviteFindUnique.mockResolvedValue({ id: 'invite-1' });

    await expect(getIsRegistrationAllowed('invite-1')).resolves.toBe(false);
    expect(mockInviteFindUnique).not.toHaveBeenCalled();
  });

  it('allows open self-hosted registration', async () => {
    process.env.ALLOW_REGISTRATION = 'true';

    await expect(getIsRegistrationAllowed()).resolves.toBe(true);
  });
});
