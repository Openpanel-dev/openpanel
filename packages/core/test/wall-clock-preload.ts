// Preloaded (BUN_OPTIONS=--preload) only by midnight-window.test.ts's child runs:
// freezes the wall clock at FIXTURE_WALL_CLOCK_ISO before any suite code loads.
//
// Core's own preload is imported first because a CLI preload may replace
// bunfig's, which pins every test at the isolated openpanel_test databases.
import { setSystemTime } from 'bun:test';
import './preload';
import { WALL_CLOCK_PINNED_MARKER } from './wall-clock.constants';

const wallClockIso = process.env.FIXTURE_WALL_CLOCK_ISO;
if (!wallClockIso) {
  throw new Error('FIXTURE_WALL_CLOCK_ISO is required');
}
setSystemTime(new Date(wallClockIso));
process.stderr.write(
  `${WALL_CLOCK_PINNED_MARKER} ${new Date().toISOString()}\n`
);
