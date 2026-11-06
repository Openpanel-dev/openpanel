// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { changeChartType, changeFunnelGroup, ready } from '../reportSlice';
import { ReportSettings } from './ReportSettings';
import makeStore from '@/redux';

vi.mock('@/hooks/use-app-params', () => ({
  useAppParams: () => ({ projectId: 'project' }),
}));
vi.mock('@/hooks/use-event-names', () => ({
  useEventNames: () => [],
}));

function renderFunnelGroupedByGroup(chartType: 'funnel' | 'conversion') {
  const store = makeStore();
  store.dispatch(ready());
  store.dispatch(changeChartType('funnel'));
  store.dispatch(changeFunnelGroup('group'));
  store.dispatch(changeChartType(chartType));
  render(
    <Provider store={store}>
      <ReportSettings />
    </Provider>
  );
  return store;
}

function funnelGroupControl() {
  const row = screen.getByText('Funnel Group').parentElement;
  return row?.querySelector('[role="combobox"]');
}

describe('ReportSettings funnel group', () => {
  afterEach(cleanup);

  test('shows Group on a funnel chart', () => {
    renderFunnelGroupedByGroup('funnel');
    expect(funnelGroupControl()?.textContent).toBe('Group');
  });

  test('shows Session on a conversion chart and keeps the stored group', () => {
    const store = renderFunnelGroupedByGroup('conversion');
    expect(funnelGroupControl()?.textContent).toBe('Session');
    expect(store.getState().report.options).toMatchObject({
      funnelGroup: 'group',
    });
  });
});
