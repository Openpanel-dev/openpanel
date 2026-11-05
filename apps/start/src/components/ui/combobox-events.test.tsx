// @vitest-environment jsdom

// The report builder must accept an event that has not been tracked yet, so a
// chart or funnel can be set up before the event ships. The picker offers the
// typed name as an "Add" row, and keeps a selected unseen name visible so it
// can be toggled off again.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  ComboboxEvents,
  getEventRows,
  toCommandValue,
} from './combobox-events';

const items: Parameters<typeof getEventRows>[0]['items'] = [
  { name: 'checkout_started', count: 120, meta: undefined },
  { name: 'checkout_completed', count: 80, meta: undefined },
];

function rows(
  overrides: Partial<Parameters<typeof getEventRows>[0]> = {}
): ReturnType<typeof getEventRows> {
  return getEventRows({
    items,
    customEvents: [],
    search: '',
    selectedValues: [],
    allowUnseenEvents: true,
    ...overrides,
  });
}

describe('getEventRows', () => {
  test('offers the typed name last when no event matches it exactly', () => {
    const result = rows({ search: 'checkout' });
    expect(result.map((row) => row.key)).toEqual([
      'event:checkout_started',
      'event:checkout_completed',
      'add:checkout',
    ]);
  });

  test('trims the typed name', () => {
    const result = rows({ search: '  checkout_v2_completed ' });
    expect(result).toEqual([
      {
        key: 'add:checkout_v2_completed',
        kind: 'add',
        name: 'checkout_v2_completed',
      },
    ]);
  });

  test('does not offer a name that is already a known event', () => {
    const result = rows({ search: 'checkout_completed' });
    expect(result.some((row) => row.kind === 'add')).toBe(false);
  });

  test('treats names as case sensitive, like the query does', () => {
    const result = rows({ search: 'Checkout_Completed' });
    expect(result.at(-1)).toMatchObject({
      kind: 'add',
      name: 'Checkout_Completed',
    });
  });

  test('does not offer a name that is a saved custom event', () => {
    const result = rows({
      search: 'Checkout',
      customEvents: [{ id: 'ce_1', name: 'Checkout' }],
    });
    expect(result.some((row) => row.kind === 'add')).toBe(false);
  });

  test('offers nothing extra when the option is off', () => {
    const result = rows({
      search: 'checkout_v2_completed',
      selectedValues: ['checkout_v2_completed'],
      allowUnseenEvents: false,
    });
    expect(result).toEqual([]);
  });

  test('keeps a selected unseen name listed instead of offering it again', () => {
    const result = rows({
      search: 'checkout_v2',
      selectedValues: ['checkout_v2_completed'],
    });
    expect(result.map((row) => row.key)).toEqual([
      'unseen:checkout_v2_completed',
      'add:checkout_v2',
    ]);
    expect(
      rows({
        search: 'checkout_v2_completed',
        selectedValues: ['checkout_v2_completed'],
      }).map((row) => row.key)
    ).toEqual(['unseen:checkout_v2_completed']);
  });

  test('lists a selected unseen name before known events with no search', () => {
    const result = rows({ selectedValues: ['checkout_v2_completed'] });
    expect(result.map((row) => row.key)).toEqual([
      'unseen:checkout_v2_completed',
      'event:checkout_started',
      'event:checkout_completed',
    ]);
  });

  test('keeps the add row apart from an event named like its key', () => {
    const result = rows({
      items: [{ name: 'add:checkout', count: 1, meta: undefined }],
      search: 'checkout',
    });
    expect(result.map((row) => row.key)).toEqual([
      'event:add:checkout',
      'add:checkout',
    ]);
  });
});

describe('toCommandValue', () => {
  const asCmdkStoresIt = (value: string) => value.trim().toLowerCase();

  test('stays distinct for names differing by case or outer spaces', () => {
    const keys = [
      'event:Add_To_Cart',
      'event:add_to_cart',
      'event:add_to_cart ',
    ];
    const values = keys.map((key) => asCmdkStoresIt(toCommandValue(key)));
    expect(new Set(values).size).toBe(keys.length);
  });

  test('survives cmdk unchanged, so a row keeps it when rows reorder', () => {
    const value = toCommandValue('event:Add_To_Cart');
    expect(asCmdkStoresIt(value)).toBe(value);
  });
});

describe('ComboboxEvents', () => {
  // Keep event names short once the picker is open. cmdk finds the highlighted
  // row by its hyphenated toCommandValue, and jsdom's selector engine backtracks
  // on those hyphens: each extra character doubles the lookup, and a
  // 25-character row key takes over 3 s.

  // floating-ui asks these on every position update, and jsdom's selector engine
  // takes seconds per answer, enough to stall the vitest worker. The stub stays
  // for the whole file, because a position update outlives the last test.
  const topLayerSelectors = [':popover-open', ':modal'];
  const nativeMatches = Element.prototype.matches;
  beforeAll(() => {
    // jsdom has no layout, and cmdk scrolls the highlighted row into view.
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.matches = function matches(selector: string) {
      return (
        !topLayerSelectors.includes(selector) &&
        nativeMatches.call(this, selector)
      );
    };
  });
  afterEach(cleanup);

  test('shows an unseen name with its own casing when closed', () => {
    render(
      <ComboboxEvents
        allowUnseenEvents
        items={items}
        onChange={vi.fn()}
        placeholder="Select event"
        value="Checkout_Completed"
      />
    );

    expect(screen.getByRole('combobox').textContent).toBe('Checkout_Completed');
  });

  test('selecting the add row emits the typed name', () => {
    const onChange = vi.fn();
    render(
      <ComboboxEvents
        allowUnseenEvents
        items={[{ name: 'signup', count: 1, meta: undefined }]}
        onChange={onChange}
        placeholder="Select event"
        searchable
        value=""
      />
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Search event...'), {
      target: { value: 'signup_v2' },
    });
    fireEvent.click(screen.getByText('Add "signup_v2"'));

    expect(onChange).toHaveBeenCalledWith('signup_v2');
  });

  test('keyboard reaches events that differ only by case', () => {
    const onChange = vi.fn();
    render(
      <ComboboxEvents
        items={[
          { name: 'Add_To_Cart', count: 2, meta: undefined },
          { name: 'add_to_cart', count: 1, meta: undefined },
        ]}
        onChange={onChange}
        placeholder="Select event"
        searchable
        value=""
      />
    );

    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Search event...');
    expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('add_to_cart');
  });

  test('highlight follows the event when rows reorder', () => {
    const onChange = vi.fn();
    const first = { name: 'Add_To_Cart', count: 2, meta: undefined };
    const second = { name: 'add_to_cart', count: 1, meta: undefined };
    const picker = (eventRows: typeof items) => (
      <ComboboxEvents
        items={eventRows}
        onChange={onChange}
        placeholder="Select event"
        searchable
        value=""
      />
    );
    const { rerender } = render(picker([first, second]));

    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Search event...');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    rerender(picker([second, first]));
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('add_to_cart');
  });
});
