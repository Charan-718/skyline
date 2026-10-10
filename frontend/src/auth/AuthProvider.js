import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/endpoints';
import { onUnauthorized } from '../api/client';

const AuthContext = createContext(null);

/**
 * Session state comes from GET /auth/me. Capabilities only drive navigation —
 * the backend re-checks every permission (LLD §6, HLD §5).
 */
export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me().catch((e) => (e.code === 'UNAUTHENTICATED' ? null : Promise.reject(e))),
    staleTime: 60000,
    retry: false,
  });

  useEffect(() => {
    onUnauthorized(() => qc.setQueryData(['me'], null));
  }, [qc]);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['me'] }), [qc]);
  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    }
  }, [qc]);

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
      setSession: (payload) => qc.setQueryData(['me'], payload),
      rolesIn,
      hasRole: (clubId, ...roles) => rolesIn(clubId).some((r) => roles.includes(r)),
      isVerified: !!caps?.verifiedStudent,
      membershipIn: (clubId) => (caps?.memberships || []).find((m) => m.clubId === clubId) || null,
      managedClubIds: [...new Set([...(caps?.clubRoles || []).map((r) => r.clubId)])],
      organizerOf: caps?.organizerOf || [],
      staffOf: caps?.staffOf || [],
    };
  }, [me.data, me.isPending, me.error, refresh, signOut, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
