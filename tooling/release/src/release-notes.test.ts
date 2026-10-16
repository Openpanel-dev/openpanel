import { describe, expect, test } from 'bun:test';
import type OpenAI from 'openai';
import {
  fallbackNotes,
  generateNotes,
  isUpgradeSensitive,
  type NotesInput,
  stripMarkers,
} from './release-notes';

const input: NotesInput = {
  version: '3.1.0',
  previous: '3.0.0',
  commits: [
    {
      sha: 'a'.repeat(40),
      subject: 'feat(api): export endpoint [minor]',
      body: 'Adds /export.',
    },
    { sha: 'b'.repeat(40), subject: 'fix: stop crash [release now]', body: '' },
  ],
  sensitivePaths: ['apps/api/src/config/env.ts'],
  compareUrl: 'https://github.com/o/r/compare/v3.0.0...v3.1.0',
};

// Just enough of the client for generateNotes; each test decides the outcome.
const fakeClient = (create: () => Promise<unknown>) =>
  ({ responses: { create } }) as unknown as OpenAI;

describe('release notes', () => {
  test('CI markers never reach the notes', () => {
    expect(stripMarkers('fix: stop crash [release now] [MINOR]')).toBe(
      'fix: stop crash'
    );
  });

  test('upgrade-sensitive paths are recognised', () => {
    expect(isUpgradeSensitive('self-hosting/docker-compose.template.yml')).toBe(
      true
    );
    expect(
      isUpgradeSensitive('packages/db/prisma/migrations/2026/migration.sql')
    ).toBe(true);
    expect(isUpgradeSensitive('apps/start/src/routes/index.tsx')).toBe(false);
  });

  test('the fallback lists every commit without markers, with the compare link', () => {
    const notes = fallbackNotes(input);
    expect(notes).toContain('- feat(api): export endpoint (aaaaaaa)');
    expect(notes).toContain('- fix: stop crash (bbbbbbb)');
    expect(notes).not.toContain('[');
    expect(notes).toContain(input.compareUrl as string);
  });

  test('no API key means the fallback, not a failed release', async () => {
    expect(await generateNotes(input, null)).toMatchObject({
      source: 'fallback',
      reason: 'no API key',
    });
  });

  test('an API error means the fallback, not a failed release', async () => {
    const client = fakeClient(() =>
      Promise.reject(new Error('529 overloaded'))
    );
    expect(await generateNotes(input, client)).toMatchObject({
      source: 'fallback',
      reason: '529 overloaded',
    });
  });

  test('an incomplete response (cut off or declined) means the fallback', async () => {
    const client = fakeClient(() =>
      Promise.resolve({ status: 'incomplete', output_text: '## Added\n- half' })
    );
    expect(await generateNotes(input, client)).toMatchObject({
      source: 'fallback',
      reason: 'response incomplete',
    });
  });

  test('model text is used, with the compare link appended', async () => {
    const client = fakeClient(() =>
      Promise.resolve({
        status: 'completed',
        output_text: '## Added\n- Export endpoint',
      })
    );
    const notes = await generateNotes(input, client);
    expect(notes.source).toBe('model');
    expect(notes.markdown).toStartWith('## Added\n- Export endpoint');
    expect(notes.markdown).toContain(input.compareUrl as string);
  });
});
