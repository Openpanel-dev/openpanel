import { cn } from '@/utils/cn';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react';
import { useState, useTransition } from 'react';

import { useIsFetching } from '@tanstack/react-query';
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
  canNextPage: boolean;
  canPreviousPage: boolean;
  pageIndex: number;
  nextPage: () => void;
  previousPage: () => void;
  className?: string;
  loading?: boolean;
  firstPage?: () => void;
  lastPage?: () => void;
};

export function Pagination({
  canNextPage,
  canPreviousPage,
  pageIndex,
  firstPage,
  lastPage,
  nextPage,
  previousPage,
  className,
  loading,
}: Props) {
  const isFetching = useIsFetching() > 0;
  const [isPending, startTransition] = useTransition();
  const isLoading = isFetching || isPending;
  return (
    <div
      className={cn(
        'flex select-none items-center justify-end gap-1',
        className,
      )}
    >
      {typeof firstPage === 'function' && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => startTransition(() => firstPage?.())}
          disabled={!canPreviousPage}
          className="max-sm:hidden"
          icon={ChevronsLeftIcon}
        />
      )}
      <Button
        variant="outline"
        size="icon"
        onClick={() => startTransition(() => previousPage())}
        disabled={!canPreviousPage}
        icon={ChevronLeftIcon}
      />

      <Button
        loading={isLoading}
        loadingType="ring"
        disabled
        variant="outline"
        size="icon"
      >
        {isLoading ? '' : pageIndex + 1}
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={() => startTransition(() => nextPage())}
        disabled={!canNextPage}
        icon={ChevronRightIcon}
      />

      {typeof lastPage === 'function' && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => startTransition(() => lastPage?.())}
          disabled={!canNextPage}
          className="max-sm:hidden"
          icon={ChevronsRightIcon}
        />
      )}
    </div>
  );
}
