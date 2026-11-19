// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FeedbackButton } from './feedback-button';

const routeContext = vi.hoisted(() => ({
  current: {} as { isSelfHosted?: boolean },
}));

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => routeContext.current,
}));

vi.mock('@/utils/op', () => ({ op: { track: vi.fn() } }));

describe('FeedbackButton', () => {
  afterEach(cleanup);

  test('opens the widget on cloud', () => {
    routeContext.current = { isSelfHosted: false };
    render(<FeedbackButton />);
    expect(screen.getByRole('button', { name: 'Give feedback' })).toBeDefined();
  });

  test('links to the public board on a self-hosted install, where no widget loads', () => {
    routeContext.current = { isSelfHosted: true };
    render(<FeedbackButton />);
    expect(
      screen.getByRole('link', { name: 'Give feedback' }).getAttribute('href')
    ).toBe('https://feedback.openpanel.dev');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
