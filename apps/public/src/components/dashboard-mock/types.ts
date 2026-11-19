import type { DashboardPage } from './frame';

// One entry per thing a page can show with <VisualMock name="…" />.
// `content` is the view itself; `shell` says which dashboard page it lives
// on when shown as a full window. Minis have no shell.
export interface MockDefinition {
  content: () => React.ReactNode;
  shell?: { page: DashboardPage; project: string; range?: string };
  // Natural width of the content when shown cut off at a panel edge.
  insetWidth?: number;
}
