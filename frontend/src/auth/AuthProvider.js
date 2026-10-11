import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/endpoints';
import { hasSessionHint, onUnauthorized } from '../api/client';

const AuthContext = createContext(null);

/**
 * Session state comes from GET /auth/me. Capabilities only drive navigation —
 * the backend re-checks every permission (LLD §6, HLD §5).
 */
export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    // No session hint means nobody has signed in here, so skip the request (and its 401).
    queryFn: () => (hasSessionHint() ? authApi.me().catch((e) => (e.code === 'UNAUTHENTICATED' ? null : Promise.reject(e))) : null),
    staleTime: 60000,
    retry: false,
  });

  // Drop every cached query except the session itself, then mark the visitor as signed out.
  // Private data must never outlive the session that fetched it.
  const resetSession = useCallback(() => {
    qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], null);
  }, [qc]);

  useEffect(() => {
    onUnauthorized(() => resetSession());
  }, [resetSession]);

  // Back/forward cache: a page restored from it may still show the previous user. Reload so the
  // session is checked again (a signed-out visitor is sent to the sign-in page).
  useEffect(() => {
    const onPageShow = (event) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['me'] }), [qc]);
  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      resetSession();
    }
  }, [resetSession]);

  const value = useMemo(() => {
    const data = me.data;
    const caps = data?.capabilities;
    const rolesIn = (clubId) => (caps?.clubRoles || []).filter((r) => r.clubId === clubId).map((r) => r.role);
    return {
      loading: me.isPending,
      error: me.error,
      user: data?.user || null,
      capabilities: caps || null,
      refresh,
      signOut,
      // A new sign-in starts from an empty cache, so the previous user's data is never shown.
      setSession: (payload) => {
        resetSession();
        qc.setQueryData(['me'], payload);
      },
      rolesIn,
      hasRole: (clubId, ...roles) => rolesIn(clubId).some((r) => roles.includes(r)),
      isVerified: !!caps?.verifiedStudent,
      membershipIn: (clubId) => (caps?.memberships || []).find((m) => m.clubId === clubId) || null,
      managedClubIds: [...new Set([...(caps?.clubRoles || []).map((r) => r.clubId)])],
      organizerOf: caps?.organizerOf || [],
      staffOf: caps?.staffOf || [],
    };
  }, [me.data, me.isPending, me.error, refresh, signOut, resetSession, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
