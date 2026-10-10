import { Navigate, useLocation, useParams } from 'react-router-dom';
import { LockKey } from '@phosphor-icons/react';
import { useAuth } from './AuthProvider';
import { EmptyState, PageLoader } from '../components/feedback';
import { Button } from '../components/Button';

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

/** UI-only guard for club-scoped pages. `roles` = ['CLUB_HEAD', …] or 'TEAM'. */
export function RequireClubRole({ roles, children }) {
  const { clubId } = useParams();
  const { rolesIn, loading } = useAuth();
  if (loading) return <PageLoader />;
  const mine = rolesIn(clubId);
  const allowed = roles === 'TEAM' ? mine.length > 0 : mine.some((r) => roles.includes(r));
  if (!allowed) {
    return (
      <div className="card">
        <EmptyState icon={LockKey} title="You don't have access to this page" action={<Button to="/">Go to home</Button>}>
          This area is for {roles === 'TEAM' ? 'club team members' : roles.map((r) => r.replace('_', ' ').toLowerCase()).join(' or ')} of this club. Ask your club head if you need access.
        </EmptyState>
      </div>
    );
  }
  return children;
}
