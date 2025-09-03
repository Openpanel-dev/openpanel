import { cn } from '@/utils/cn';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
} from 'lucide-react';
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

export type Props = {
  take?: number;
  count?: number;
  cursor: unknown;
  className?: string;
  size?: 'sm' | 'base';
  loading?: boolean;

  onPrevCursor: () => void;
  isPrevDisabled: boolean;
  onNextCursor: () => void;
  isNextDisabled: boolean;
  onReset: () => void;
};

export function Pagination({
  take,
  count,
  cursor,
  onPrevCursor,
  isPrevDisabled,
  onNextCursor,
  isNextDisabled,
  onReset,
  className,
  size = 'base',
  loading,
}: Props) {
  return (
    <div
      className={cn(
        'flex select-none items-center justify-end gap-1',
        className,
      )}
    >
      {size === 'base' && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => onReset}
          disabled={cursor === 0}
          className="max-sm:hidden"
          icon={ChevronsLeftIcon}
        />
      )}
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPrevCursor()}
        disabled={isPrevDisabled}
        icon={ChevronLeftIcon}
      />

      <Button
        variant="outline"
        size="icon"
        onClick={() => onNextCursor()}
        disabled={isNextDisabled}
        icon={ChevronRightIcon}
      />
    </div>
  );
}
