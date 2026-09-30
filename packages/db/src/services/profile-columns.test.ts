import { describe, expect, it } from 'vitest';
import {
  isProfileColumn,
  profileJoinColumns,
} from './filter-where.service';

describe('profileJoinColumns (GHSA-pc3q-gw7f-p2x2)', () => {
  it('maps filter names to allowlisted columns and always includes id', () => {
    expect(
      profileJoinColumns([
        'profile.email',
        'profile.properties.plan',
        'first_name',
        'properties.tier',
      ]),
    ).toEqual(['id', 'email', 'properties', 'first_name']);
  });

  it('drops anything that is not a real column', () => {
    expect(
      profileJoinColumns([
        "profile.email, project_id FROM profiles) AS p USING (project_id) -- ",
        'profile.password',
        'profile.email;',
      ]),
    ).toEqual(['id']);
  });
});

describe('isProfileColumn (GHSA-4j6c-j6vc-xq96)', () => {
  it('accepts real columns with or without the prefix', () => {
    expect(isProfileColumn('email')).toBe(true);
    expect(isProfileColumn('profile.last_seen_at')).toBe(true);
  });

  it('rejects expressions', () => {
    expect(isProfileColumn("email as values FROM profiles WHERE project_id = 'x' -- ")).toBe(false);
    expect(isProfileColumn('properties')).toBe(false);
    expect(isProfileColumn('')).toBe(false);
  });
});
