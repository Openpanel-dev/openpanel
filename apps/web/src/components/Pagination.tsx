import { useMemo, useState } from 'react';

import { Button } from './ui/button';

export function usePagination(take = 100) {
  const [skip, setSkip] = useState(0);
  return useMemo(
    () => ({
      skip,
      next: () => setSkip((p) => p + take),
      prev: () => setSkip((p) => Math.max(p - take)),
      take,
      canPrev: skip > 0,
      canNext: true,
      page: skip / take + 1,
    }),
    [skip, setSkip, take]
  );
}

export type PaginationProps = ReturnType<typeof usePagination>;

export function Pagination(props: PaginationProps) {
  return (
    <div className="flex select-none items-center justify-end gap-2">
      <div className="font-medium text-xs">Page: {props.page}</div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => props.prev()}
        disabled={!props.canPrev}
      >
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => props.next()}
        disabled={!props.canNext}
      >
        Next
      </Button>
    </div>
  );
}
