import { useCallback, useRef } from 'react';
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
