// @vitest-environment jsdom

// An error and an empty result both produce zero rows, so a failed query must
// not render "nothing here yet" (a 500 from `profile.list` is not "you haven't
// identified any profiles yet").

import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { DataTable } from './data-table';

interface Row {
  name: string;
}

const COLUMNS: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Name', cell: ({ row }) => row.original.name },
];

const EMPTY = {
  title: 'No profiles',
  description: "Looks like you haven't identified any profiles yet.",
};

function Harness({ error, rows }: { error?: boolean; rows: Row[] }) {
  const table = useReactTable({
    data: rows,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
    // `src/types/data-table.ts` declares a custom `isWithinRange` filter, so
    // TableOptions requires it. This table does no filtering; the same stub
    // appears in report-table.tsx and groups/table/index.tsx.
    filterFns: { isWithinRange: () => true },
  });
  return <DataTable empty={EMPTY} error={error} table={table} />;
}

// Match on the descriptions: both states render a title in an <h1>, so a
// title match is ambiguous.
const EMPTY_TEXT = /haven't identified any profiles/;
const ERROR_TEXT = /could not load this data/;

const count = (pattern: RegExp) => screen.queryAllByText(pattern).length;

// `screen` queries the whole document and vitest.config.ts registers no setup
// file, so without this each render stacks on the last one's DOM.
afterEach(cleanup);

describe('DataTable', () => {
  test('renders the empty state when the query simply returned nothing', () => {
    render(<Harness rows={[]} />);
    expect([count(EMPTY_TEXT), count(ERROR_TEXT)]).toEqual([1, 0]);
  });

  test('renders an error instead of the empty state when the query failed', () => {
    render(<Harness error rows={[]} />);
    expect([count(EMPTY_TEXT), count(ERROR_TEXT)]).toEqual([0, 1]);
  });

  test('an error wins over rows that are still in the cache', () => {
    render(<Harness error rows={[{ name: 'stale row' }]} />);
    expect(count(ERROR_TEXT)).toBe(1);
    expect(screen.queryByText('stale row')).toBeNull();
  });

  test('renders rows normally', () => {
    render(<Harness rows={[{ name: 'ada' }]} />);
    expect(screen.queryByText('ada')).not.toBeNull();
    expect([count(EMPTY_TEXT), count(ERROR_TEXT)]).toEqual([0, 0]);
  });
});
