import { Link } from 'react-router-dom';
import { plural } from '../../utils/dates';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarBlank, Megaphone } from '@phosphor-icons/react';
import { announcementsApi, clubsApi, eventsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Card } from '../../components/layout';
import { Button } from '../../components/Button';
import { Alert, EmptyState, LoadingState, QueryState } from '../../components/feedback';
import { AnnouncementItem, EventCard } from '../../components/cards';

export default function Home() {
  const { user, isVerified, managedClubIds } = useAuth();
  const events = useQuery({ queryKey: ['events', 'home'], queryFn: () => eventsApi.list({ pageSize: 6 }) });
  const news = useQuery({ queryKey: ['announcements', 'home'], queryFn: () => announcementsApi.feed({ pageSize: 4 }) });
  const clubs = useQuery({ queryKey: ['clubs'], queryFn: () => clubsApi.list() });

  return (
    <div className="stack-lg">
      <section className="hero">
        <div className="hero-collage" aria-hidden>
          <img className="hero-shot hero-shot-a" src={`${process.env.PUBLIC_URL}/odoo-1.webp`} alt="" />
          <img className="hero-shot hero-shot-b" src={`${process.env.PUBLIC_URL}/odoo-2.webp`} alt="" />
          <img className="hero-shot hero-shot-c" src={`${process.env.PUBLIC_URL}/Volunteers_Hackathon.webp`} alt="" />
        </div>
        <p className="lead-in">{user ? `Welcome back, ${user.fullName.split(' ')[0]}.` : 'For every club on campus,'}</p>
        <h1 tabIndex={-1} data-page-title>
          Clubs, events &amp; money<span className="accent-mark">.</span>
        </h1>
        <p className="tagline">Join clubs, book events with a QR ticket, order merch from your phone and keep every rupee accounted for.</p>
        <p className="tags">[ memberships · events · merchandise · finance ]</p>
        <div className="actions" style={{ marginTop: 'var(--space-6)' }}>
          <Button variant="primary" to="/events" data-tour="browse-events">
            Browse events
          </Button>
          {managedClubIds[0] && <Button to={`/manage/${managedClubIds[0]}`}>Open club dashboard</Button>}
        </div>
      </section>

      {user && !isVerified && (
        <Alert tone="info" title="Verify your student ID to join clubs" action={<Button size="sm" to="/me/profile">Verify now</Button>}>
          You can browse and book public events already. Membership plans are offered to verified college students.
        </Alert>
      )}

      <div className="grid grid-main-side">
        <Card title="Upcoming events" actions={<Button variant="ghost" size="sm" to="/events" iconRight={ArrowRight}>All events</Button>}>
          <QueryState query={events} loading={<LoadingState />} isEmpty={(d) => !d?.data?.length} empty={<EmptyState icon={CalendarBlank} title="No upcoming events">Check back soon. Clubs publish their events here.</EmptyState>}>
            {(d) => (
              <div className="grid grid-2">
                {(d?.data || []).map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            )}
          </QueryState>
        </Card>
        <div className="stack">
          <Card title="Latest announcements" actions={<Button variant="ghost" size="sm" to="/announcements">View all</Button>}>
            <QueryState query={news} isEmpty={(d) => !d?.data?.length} empty={<EmptyState icon={Megaphone} title="Nothing announced yet" />}>
              {(d) => (
                <div className="stack">
                  {(d?.data || []).map((a, i) => (
                    <div key={a.id} className="stack">
                      {i > 0 && <hr className="divider" style={{ margin: 0 }} />}
                      <AnnouncementItem a={a} />
                    </div>
                  ))}
                </div>
              )}
            </QueryState>
          </Card>
          <Card title="Clubs">
            <QueryState query={clubs}>
              {(list) => {
                const items = Array.isArray(list) ? list : Array.isArray(list?.data) ? list.data : [];
                return (
                  <ul className="list">
                    {items.map((c) => (
                      <li key={c.id} style={{ paddingInline: 0 }} className="row-between">
                        <div>
                          <Link to={`/clubs/${c.slug}`} className="cell-title">
                            {c.name}
                          </Link>
                          <div className="cell-sub">
                            <span className="num">{`${plural(c.memberCount, 'member')} · ${plural(c.upcomingEvents, 'event')}`}</span>
                          </div>
                        </div>
                        <Button size="sm" to={`/clubs/${c.slug}`}>
                          View
                        </Button>
                      </li>
                    ))}
                  </ul>
                );
              }}
            </QueryState>
          </Card>
        </div>
      </div>
    </div>
  );
}
