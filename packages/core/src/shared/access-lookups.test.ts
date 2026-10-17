// The scope rule replaced "no rows means every project". Every verdict the
// old rule gave is re-derived here from the shape the migration writes, so a
// change to either side shows up as a diff rather than as a surprised member.

import { expect, test } from 'bun:test';
import { effectiveProjectGrants, resolveProjectAccess } from './access-lookups';

test('scope all follows the role: write for members and admins, read for viewers', () => {
  for (const role of ['org:admin', 'org:member', 'admin', 'member', 'owner']) {
    expect(
      resolveProjectAccess({ role, projectScope: 'all', grant: null })
    ).toEqual({ level: 'write' });
  }
  expect(
    resolveProjectAccess({ role: 'viewer', projectScope: 'all', grant: null })
  ).toEqual({ level: 'read' });
});

test('scope selected without a row is no access, whatever the role', () => {
  for (const role of ['org:admin', 'owner', 'member', 'viewer']) {
    expect(
      resolveProjectAccess({ role, projectScope: 'selected', grant: null })
    ).toBeNull();
  }
});

test('a selected row derives write from the role unless it restricts to read', () => {
  expect(
    resolveProjectAccess({
      role: 'org:member',
      projectScope: 'selected',
      grant: { level: null },
    })
  ).toEqual({ level: 'write' });
  expect(
    resolveProjectAccess({
      role: 'org:member',
      projectScope: 'selected',
      grant: { level: 'read' },
    })
  ).toEqual({ level: 'read' });
});

test('a viewer never gets more than read from a row', () => {
  expect(
    resolveProjectAccess({
      role: 'viewer',
      projectScope: 'selected',
      grant: { level: 'write' },
    })
  ).toEqual({ level: 'read' });
});

// What the previous build answered, spelled out so the migration's mapping
// (no rows → all; rows → selected, read kept, write/admin → null) is checked
// against it rather than assumed.
function legacyProjectAccess(
  rows: { projectId: string; level: 'read' | 'write' | 'admin' }[],
  projectId: string
) {
  if (rows.length === 0) {
    return { level: 'write' as const };
  }
  const row = rows.find((item) => item.projectId === projectId);
  return row ? { level: row.level } : null;
}

function migrated(
  rows: { projectId: string; level: 'read' | 'write' | 'admin' }[],
  projectId: string
) {
  const grant = rows.find((item) => item.projectId === projectId);
  return resolveProjectAccess({
    role: 'org:member',
    projectScope: rows.length === 0 ? 'all' : 'selected',
    grant: grant ? { level: grant.level === 'read' ? 'read' : null } : null,
  });
}

test('the migrated shape gives the same verdict as the legacy rule for every row shape', () => {
  const fixtures: { projectId: string; level: 'read' | 'write' | 'admin' }[][] =
    [
      [],
      [{ projectId: 'a', level: 'write' }],
      [{ projectId: 'a', level: 'read' }],
      [{ projectId: 'a', level: 'admin' }],
      [
        { projectId: 'a', level: 'read' },
        { projectId: 'b', level: 'write' },
      ],
    ];
  for (const rows of fixtures) {
    for (const projectId of ['a', 'b', 'c']) {
      const legacy = legacyProjectAccess(rows, projectId);
      const current = migrated(rows, projectId);
      // `admin` collapses to write: the ladder already treats them alike.
      const expected =
        legacy?.level === 'admin' ? { level: 'write' as const } : legacy;
      expect(current).toEqual(expected);
    }
  }
});

test('legacy rows written by the previous image override a stale all scope', () => {
  expect(
    effectiveProjectGrants({
      projectScope: 'all',
      projects: [],
      legacyGrants: [
        { projectId: 'a', level: 'read' },
        { projectId: 'b', level: 'write' },
      ],
    })
  ).toEqual({
    projectScope: 'selected',
    projects: [
      { projectId: 'a', level: 'read' },
      { projectId: 'b', level: null },
    ],
  });
});

test('without legacy rows the member scope and rows apply as stored', () => {
  const member = {
    projectScope: 'selected' as const,
    projects: [{ projectId: 'a', level: null }],
    legacyGrants: [],
  };
  expect(effectiveProjectGrants(member)).toEqual({
    projectScope: 'selected',
    projects: [{ projectId: 'a', level: null }],
  });
});
