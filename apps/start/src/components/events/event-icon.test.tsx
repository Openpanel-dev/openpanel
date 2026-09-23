// @vitest-environment jsdom

// `meta.icon` is a free-text column an operator fills in, so it can name an
// icon `EventIconMapper` does not carry — or be the empty string, which is
// not nullish and therefore survives the `??` chain. Either way the lookup
// used to yield `undefined`, and rendering `undefined` as a component makes
// React throw "Element type is invalid" and discard the whole subtree. On the
// mobile events list (`event-list-item.tsx`) that is the entire page.

import type { EventMeta } from '@openpanel/db';
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { EventIcon } from './event-icon';

function metaWithIcon(icon: string): EventMeta {
  return { icon, color: 'blue' } as EventMeta;
}

describe('EventIcon', () => {
  test('renders a known icon from meta', () => {
    const { container } = render(
      <EventIcon meta={metaWithIcon('HomeIcon')} name="screen_view" />
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  test('falls back when meta names an icon the mapper does not carry', () => {
    const { container } = render(
      <EventIcon meta={metaWithIcon('NoSuchIcon')} name="screen_view" />
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  test('falls back when meta carries an empty icon name', () => {
    const { container } = render(
      <EventIcon meta={metaWithIcon('')} name="screen_view" />
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  test('renders for an event name with no record and no meta', () => {
    const { container } = render(<EventIcon name="an_unseeded_event" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
