import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarBlank, IdentificationBadge, Megaphone, ShoppingBag } from '@phosphor-icons/react';
import { announcementsApi, eventsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { useClub } from '../../hooks';
import { Card, PageHeader, Tabs } from '../../components/layout';
import { Alert, EmptyState, ErrorState, LoadingState, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { AnnouncementItem, EventCard } from '../../components/cards';
import { formatDate } from '../../utils/dates';
import JoinDialog from './JoinDialog';

function MembershipPanel({ club }) {
  const { user, isVerified, membershipIn } = useAuth();
  const [open, setOpen] = useState(false);
  const m = user && membershipIn(club.id);
  let body;
  if (!user) body = <><p className="muted">Sign in to join {club.name}.</p><Button variant="primary" to={`/login?next=/clubs/${club.slug}`} block>Sign in to join</Button></>;
  else if (m && m.effectiveStatus === 'ACTIVE') body = <><StatusBadge status="ACTIVE" /><p className="muted">Valid until {formatDate(m.expiresOn)}.</p><Button to={`/me/memberships/${m.membershipId}`} block>View membership</Button></>;
  else if (m && m.effectiveStatus === 'EXPIRED') body = <><StatusBadge status="EXPIRED" /><p className="muted">Expired on {formatDate(m.expiresOn)}. Renew to get member prices again.</p><Button variant="primary" to={`/me/memberships/${m.membershipId}`} block>Renew membership</Button></>;
  else if (m && m.effectiveStatus === 'PENDING_PAYMENT') body = <><StatusBadge status="PENDING_PAYMENT" /><Button to={`/me/memberships/${m.membershipId}`} block>Finish joining</Button></>;
  else if (!isVerified) body = <><Alert tone="info">Membership plans are for verified college students.</Alert><Button variant="primary" to="/me/profile" block>Verify student ID</Button></>;
  else body = <><p className="muted">Members get discounted tickets and merchandise.</p><Button variant="primary" icon={IdentificationBadge} onClick={() => setOpen(true)} block>Join {club.name}</Button></>;
  return (
    <Card title="Membership">
      <div className="stack">{body}</div>
      {open && <JoinDialog open={open} onClose={() => setOpen(false)} club={club} />}
    </Card>
  );
}

export default function ClubPage() {
  const { clubId } = useParams();
  const [tab, setTab] = useState('events');
  const club = useClub(clubId);
  const id = club.data?.id;
  const events = useQuery({ queryKey: ['events', 'club', id], queryFn: () => eventsApi.clubEvents(id), enabled: !!id });
  const news = useQuery({ queryKey: ['announcements', 'club', id], queryFn: () => announcementsApi.clubList(id), enabled: !!id });

  if (club.isPending) return <LoadingState rows={8} />;
  if (club.isError) return <div className="card"><ErrorState error={club.error} onRetry={() => club.refetch()} /></div>;
  const c = club.data;
  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Clubs', to: '/clubs' }, { label: c.name }]} title={c.name} description={c.description} actions={<Button icon={ShoppingBag} to={`/shop/${c.id}`}>Club shop</Button>} />
      <div className="grid grid-main-side">
        <div>
          <Tabs label="Club sections" value={tab} onChange={setTab} tabs={[{ value: 'events', label: 'Events', icon: CalendarBlank }, { value: 'news', label: 'Announcements', icon: Megaphone }]} />
          {tab === 'events' ? (
            <QueryState query={events} isEmpty={(d) => !d.filter((e) => e.status === 'PUBLISHED').length} empty={<div className="card"><EmptyState icon={CalendarBlank} title="No upcoming events" /></div>}>
              {(list) => (
                <div className="grid grid-2">
                  {list.filter((e) => e.status === 'PUBLISHED').map((e) => <EventCard key={e.id} event={e} />)}
                </div>
              )}
            </QueryState>
          ) : (
            <Card>
              <QueryState query={news} empty={<EmptyState icon={Megaphone} title="No announcements yet" />}>
                {(list) => (
                  <div className="stack">
                    {list.filter((a) => a.status === 'PUBLISHED').map((a, i) => (
                      <div key={a.id} className="stack">
                        {i > 0 && <hr className="divider" style={{ margin: 0 }} />}
                        <AnnouncementItem a={a} showClub={false} />
                      </div>
                    ))}
                  </div>
                )}
              </QueryState>
            </Card>
          )}
        </div>
        <div className="stack">
          <MembershipPanel club={c} />
          <Card>
            <div className="stack-sm">
              <span className="stat-label">Community</span>
              <span className="stat-value">{c.memberCount}</span>
              <span className="stat-hint">active members</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
