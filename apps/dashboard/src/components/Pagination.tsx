import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';

import { Button } from './ui/button';

export function usePagination(take: number) {
  const [page, setPage] = useState(0);
  return {
    take,
    skip: page * take,
    setPage,
    page,
    paginate: <T,>(data: T[]): T[] =>
      data.slice(page * take, (page + 1) * take),
  };
}

export function Pagination({
  take,
  count,
  cursor,
  setCursor,
}: {
  take?: number;
  count?: number;
  cursor: number;
  setCursor: Dispatch<SetStateAction<number>>;
}) {
  const isNextDisabled =
    count !== undefined && take !== undefined && cursor * take + take >= count;

  return (
    <div className="flex select-none items-center justify-end gap-2">
      <div className="font-medium text-xs">Page: {cursor + 1}</div>
      {typeof count === 'number' && (
        <div className="font-medium text-xs">Total rows: {count}</div>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCursor((p) => Math.max(0, p - 1))}
        disabled={cursor === 0}
      >
        Previous
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setCursor((p) => p + 1)}
        disabled={isNextDisabled}
      >
        Next
      </Button>
    </div>
  );
}
