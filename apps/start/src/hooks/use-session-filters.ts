import type { IChartEventFilter } from '@openpanel/validation';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useCallback, useMemo } from 'react';

const DEBOUNCE_MS = 500;
const debounceOpts = {
  clearOnDefault: true,
  limitUrlUpdates: { method: 'debounce' as const, timeMs: DEBOUNCE_MS },
};

export function useSessionFilters() {
  const [referrer, setReferrer] = useQueryState(
    'referrer',
    parseAsString.withDefault('').withOptions(debounceOpts),
  );
  const [country, setCountry] = useQueryState(
    'country',
    parseAsString.withDefault('').withOptions(debounceOpts),
  );
  const [os, setOs] = useQueryState(
    'os',
    parseAsString.withDefault('').withOptions(debounceOpts),
  );
  const [browser, setBrowser] = useQueryState(
    'browser',
    parseAsString.withDefault('').withOptions(debounceOpts),
  );
  const [device, setDevice] = useQueryState(
    'device',
    parseAsString.withDefault('').withOptions(debounceOpts),
  );
  const [entryPage, setEntryPage] = useQueryState(
    'entryPage',
    parseAsString.withDefault('').withOptions(debounceOpts),
  );
  const [exitPage, setExitPage] = useQueryState(
    'exitPage',
    parseAsString.withDefault('').withOptions(debounceOpts),
  );
  const [minPageViews, setMinPageViews] = useQueryState(
    'minPageViews',
    parseAsInteger,
  );
  const [maxPageViews, setMaxPageViews] = useQueryState(
    'maxPageViews',
    parseAsInteger,
  );
  const [minEvents, setMinEvents] = useQueryState('minEvents', parseAsInteger);
  const [maxEvents, setMaxEvents] = useQueryState('maxEvents', parseAsInteger);

  const filters = useMemo<IChartEventFilter[]>(() => {
    const result: IChartEventFilter[] = [];
    if (referrer) {
      result.push({ name: 'referrer_name', operator: 'is', value: [referrer] });
    }
    if (country) {
      result.push({ name: 'country', operator: 'is', value: [country] });
    }
    if (os) {
      result.push({ name: 'os', operator: 'is', value: [os] });
    }
    if (browser) {
      result.push({ name: 'browser', operator: 'is', value: [browser] });
    }
    if (device) {
      result.push({ name: 'device', operator: 'is', value: [device] });
    }
    if (entryPage) {
      result.push({
        name: 'entry_path',
        operator: 'contains',
        value: [entryPage],
      });
    }
    if (exitPage) {
      result.push({
        name: 'exit_path',
        operator: 'contains',
        value: [exitPage],
      });
    }
    return result;
  }, [referrer, country, os, browser, device, entryPage, exitPage]);

  const values = useMemo(
    () => ({
      referrer,
      country,
      os,
      browser,
      device,
      entryPage,
      exitPage,
      minPageViews,
      maxPageViews,
      minEvents,
      maxEvents,
    }),
    [
      referrer,
      country,
      os,
      browser,
      device,
      entryPage,
      exitPage,
      minPageViews,
      maxPageViews,
      minEvents,
      maxEvents,
    ],
  );

  const setValue = useCallback(
    (key: string, value: string | number | null) => {
      switch (key) {
        case 'referrer':
          setReferrer(String(value ?? ''));
          break;
        case 'country':
          setCountry(String(value ?? ''));
          break;
        case 'os':
          setOs(String(value ?? ''));
          break;
        case 'browser':
          setBrowser(String(value ?? ''));
          break;
        case 'device':
          setDevice(String(value ?? ''));
          break;
        case 'entryPage':
          setEntryPage(String(value ?? ''));
          break;
        case 'exitPage':
          setExitPage(String(value ?? ''));
          break;
        case 'minPageViews':
          setMinPageViews(value != null ? Number(value) : null);
          break;
        case 'maxPageViews':
          setMaxPageViews(value != null ? Number(value) : null);
          break;
        case 'minEvents':
          setMinEvents(value != null ? Number(value) : null);
          break;
        case 'maxEvents':
          setMaxEvents(value != null ? Number(value) : null);
          break;
      }
    },
    [
      setReferrer,
      setCountry,
      setOs,
      setBrowser,
      setDevice,
      setEntryPage,
      setExitPage,
      setMinPageViews,
      setMaxPageViews,
      setMinEvents,
      setMaxEvents,
    ],
  );

  const activeCount =
    filters.length +
    (minPageViews != null ? 1 : 0) +
    (maxPageViews != null ? 1 : 0) +
    (minEvents != null ? 1 : 0) +
    (maxEvents != null ? 1 : 0);

  const clearAll = useCallback(() => {
    setReferrer('');
    setCountry('');
    setOs('');
    setBrowser('');
    setDevice('');
    setEntryPage('');
    setExitPage('');
    setMinPageViews(null);
    setMaxPageViews(null);
    setMinEvents(null);
    setMaxEvents(null);
  }, [
    setReferrer,
    setCountry,
    setOs,
    setBrowser,
    setDevice,
    setEntryPage,
    setExitPage,
    setMinPageViews,
    setMaxPageViews,
    setMinEvents,
    setMaxEvents,
  ]);

  return {
    referrer,
    setReferrer,
    country,
    setCountry,
    os,
    setOs,
    browser,
    setBrowser,
    device,
    setDevice,
    entryPage,
    setEntryPage,
    exitPage,
    setExitPage,
    minPageViews,
    setMinPageViews,
    maxPageViews,
    setMaxPageViews,
    minEvents,
    setMinEvents,
    maxEvents,
    setMaxEvents,
    filters,
    values,
    setValue,
    activeCount,
    clearAll,
  };
}
