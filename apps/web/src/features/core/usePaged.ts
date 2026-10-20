import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Page, PageQuery } from '@shulcrm/shared';
import { getPage } from './service';

type PagedList = 'families' | 'members' | 'pledges' | 'donations';

/** One page of a list from the API. The previous page stays on screen while the next loads. */
export function usePaged<T>(list: PagedList, query: PageQuery) {
  return useQuery<Page<T>>({
    // Starts with the list's own key, so invalidating ['families'] also refreshes its pages.
    queryKey: [list, 'page', query],
    queryFn: () => getPage<T>(list, query),
    placeholderData: keepPreviousData,
  });
}

/** `value`, but only after it has stopped changing for `ms` (for search boxes). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Sort state for a table header: click a column to sort, click again to flip. */
export function useSort(initial: string, initialOrder: 'asc' | 'desc' = 'asc') {
  const [sort, setSort] = useState({ key: initial, order: initialOrder });
  const toggle = (key: string, firstOrder: 'asc' | 'desc' = 'asc') =>
    setSort((s) =>
      s.key === key
        ? { key, order: s.order === 'asc' ? 'desc' : 'asc' }
        : { key, order: firstOrder },
    );
  return { ...sort, toggle };
}
