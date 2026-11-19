import { expect, test } from 'bun:test';
import { groupByLabels } from './group-by-labels';

const DATE = '2026-09-01 00:00:00';

test('an empty breakdown value before a set one keeps its position', () => {
  const groups = groupByLabels([
    {
      label_0: 'screen_view',
      label_1: '',
      label_2: 'AU',
      count: 3,
      date: DATE,
    },
    {
      label_0: 'screen_view',
      label_1: 'AU',
      label_2: '',
      count: 5,
      date: DATE,
    },
  ]);

  expect(groups.map((group) => group.name)).toEqual([
    ['screen_view', '', 'AU'],
    ['screen_view', 'AU'],
  ]);
  expect(groups.map((group) => group.data[0]?.count)).toEqual([3, 5]);
});

test('unset trailing breakdown values are dropped from the name', () => {
  const groups = groupByLabels([
    {
      label_0: 'screen_view',
      label_1: null,
      label_2: '',
      count: 1,
      date: DATE,
    },
  ]);

  expect(groups.map((group) => group.name)).toEqual([['screen_view']]);
});

test('a fill row without an event label forms no group but pads the dates', () => {
  const groups = groupByLabels([
    { label_0: 'screen_view', label_1: 'SE', count: 2, date: DATE },
    { label_0: '', count: 0, date: '2026-09-02 00:00:00' },
  ]);

  expect(groups).toHaveLength(1);
  expect(groups[0]?.data.map((point) => point.date)).toEqual([
    DATE,
    '2026-09-02 00:00:00',
  ]);
});
