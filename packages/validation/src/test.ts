import { zChartEvents } from '.';

const events = [
  {
    id: 'sAmT',
    type: 'event',
    name: 'session_end',
    segment: 'event',
    filters: [],
  },
  {
    id: '5K2v',
    type: 'event',
    name: 'session_start',
    segment: 'event',
    filters: [],
  },
  {
    id: 'lQiQ',
    type: 'formula',
    formula: 'A/B',
    displayName: '',
  },
];

const res = zChartEvents.safeParse(events);

console.log(res);
