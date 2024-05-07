import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';
import { cn } from '@/utils/cn';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react';

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
  className,
  size = 'base',
  loading,
}: {
  take: number;
  count: number;
  cursor: number;
  setCursor: Dispatch<SetStateAction<number>>;
  className?: string;
  size?: 'sm' | 'base';
  loading?: boolean;
}) {
  const lastCursor = Math.floor(count / take) - 1;
  const isNextDisabled = count === 0 || lastCursor === cursor;
  return (
    <div
      className={cn(
        'flex select-none items-center justify-end gap-2',
        className
      )}
    >
      {size === 'base' && (
        <>
          <div className="text-xs font-medium">Page: {cursor + 1}</div>
          {typeof count === 'number' && (
            <div className="text-xs font-medium">Total rows: {count}</div>
          )}
        </>
      )}
      {size === 'base' && (
        <Button
          loading={loading}
          variant="outline"
          size="icon"
          onClick={() => setCursor(0)}
          disabled={cursor === 0}
          className="max-sm:hidden"
          icon={ChevronsLeftIcon}
        />
      )}
      <Button
        loading={loading}
        variant="outline"
        size="icon"
        onClick={() => setCursor((p) => Math.max(0, p - 1))}
        disabled={cursor === 0}
        icon={ChevronLeftIcon}
      />

      <Button
        loading={loading}
        variant="outline"
        size="icon"
        onClick={() => setCursor((p) => Math.min(lastCursor, p + 1))}
        disabled={isNextDisabled}
        icon={ChevronRightIcon}
      />

      {size === 'base' && (
        <Button
          loading={loading}
          variant="outline"
          size="icon"
          onClick={() => setCursor(lastCursor)}
          disabled={isNextDisabled}
          className="max-sm:hidden"
          icon={ChevronsRightIcon}
        />
      )}
    </div>
  );
}
