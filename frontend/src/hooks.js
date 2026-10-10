import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clubsApi } from './api/endpoints';
import { newIdempotencyKey } from './api/client';

/** One Idempotency-Key per user action; reused on retry, renewed after success (LLD §6.3). */
export function useIdempotencyKey() {
  const ref = useRef(newIdempotencyKey());
  const renew = useCallback(() => {
    ref.current = newIdempotencyKey();
  }, []);
  return [() => ref.current, renew];
}

export function useClub(clubId) {
  return useQuery({ queryKey: ['club', clubId], queryFn: () => clubsApi.get(clubId), enabled: !!clubId, staleTime: 300000 });
}

/** Search debounce: the value settles 500 ms after the user stops typing. */
export const SEARCH_DEBOUNCE_MS = 500;
export function useDebounced(value, ms = SEARCH_DEBOUNCE_MS) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
