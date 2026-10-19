import { describe, expect, test } from 'bun:test';
import { buildSystemPrompt } from './prompt';

const base = {
  projectName: 'Acme',
  timezone: 'UTC',
  now: new Date('2026-10-19T12:00:00Z'),
};

describe('buildSystemPrompt', () => {
  test('Cloud users are never sent to environment variables', () => {
    const prompt = buildSystemPrompt({ ...base, selfHosted: false });
    expect(prompt).toContain('OpenPanel Cloud');
    expect(prompt).toContain('never suggest');
    expect(prompt).not.toContain('self-hosted OpenPanel install');
  });

  test('self-hosters are told they own the stack', () => {
    const prompt = buildSystemPrompt({ ...base, selfHosted: true });
    expect(prompt).toContain('self-hosted OpenPanel install');
    expect(prompt).toContain('There is no billing');
  });

  test('the launch hint lands at the end', () => {
    const prompt = buildSystemPrompt({
      ...base,
      selfHosted: false,
      hint: { page: 'profile', profileId: 'p1' },
    });
    expect(
      prompt.endsWith(
        'They were viewing profile p1; get_profile defaults to it.'
      )
    ).toBe(true);
  });
});
