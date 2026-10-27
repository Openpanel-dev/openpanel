// @vitest-environment jsdom

// The report builder must accept an event that has not been tracked yet, so a
// chart or funnel can be set up before the event ships. The picker offers the
// typed name as an "Add" row, and keeps a selected unseen name visible so it
// can be toggled off again.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ComboboxEvents, getEventRows } from './combobox-events';

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
      'checkout_started',
      'checkout_completed',
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
      'checkout_started',
      'checkout_completed',
    ]);
  });
});

describe('ComboboxEvents', () => {
  test('selecting the add row emits the typed name', () => {
    const onChange = vi.fn();
    render(
      <ComboboxEvents
        allowUnseenEvents
        items={items}
        onChange={onChange}
        placeholder="Select event"
        searchable
        value=""
      />
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Search event...'), {
      target: { value: 'checkout_v2_completed' },
    });
    fireEvent.click(screen.getByText('Add "checkout_v2_completed"'));

    expect(onChange).toHaveBeenCalledWith('checkout_v2_completed');
  });
});
