// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FeedbackWidgetScripts } from './feedback-widget-scripts';

const routeContext = vi.hoisted(() => ({
  current: {} as { isSelfHosted?: boolean },
}));

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => routeContext.current,
}));

function renderedScripts() {
  return render(<FeedbackWidgetScripts />).container.querySelectorAll('script');
}

describe('FeedbackWidgetScripts', () => {
  afterEach(cleanup);

  test('loads the widget on cloud', () => {
    routeContext.current = { isSelfHosted: false };
    const scripts = [...renderedScripts()].map((script) => script.innerHTML);
    expect(scripts.join('')).toContain('cdn.userjot.com');
  });

  test.each([
    ['self-hosted', { isSelfHosted: true }],
    ['unknown', {}],
  ])('renders nothing when hosting is %s', (_label, context) => {
    routeContext.current = context;
    expect(renderedScripts()).toHaveLength(0);
  });
});
