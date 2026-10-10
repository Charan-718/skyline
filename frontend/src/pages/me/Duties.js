import { useQueries } from '@tanstack/react-query';
import { QrCode } from '@phosphor-icons/react';
import { eventsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { PageHeader } from '../../components/layout';
import { CardsSkeleton, EmptyState, StatusBadge, Badge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { DateTile } from '../../components/domain';
import { formatDateTime } from '../../utils/dates';

export default function Duties() {
  const { organizerOf, staffOf } = useAuth();
  const ids = [...new Set([...organizerOf, ...staffOf])];
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['event', id],
      queryFn: () => eventsApi.get(id),
      retry: false,
      enabled: Boolean(id),
    })),
  });
  const loading = results.some((r) => r.isPending);
  const events = results
    .filter((r) => r.isSuccess && r.data)
    .map((r) => r.data)
    .sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1));
  return (
    <>
      <PageHeader title="Event duties" description="Events you organize or staff. Open the scanner at the door." />
      {loading ? (
        <CardsSkeleton count={3} />
      ) : !events.length ? (
        <div className="card"><EmptyState icon={QrCode} title="No event duties">When a club head assigns you to an event, it appears here.</EmptyState></div>
      ) : (
        <div className="grid grid-3">
          {events.map((e) => (
            <article key={e.id} className="card">
              <div className="card-body stack">
                <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <DateTile iso={e.startsAt} />
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: 'var(--font-size-base)' }} className="wrap-anywhere">{e.title}</h2>
                    <p className="subtle">{e.clubName} · {formatDateTime(e.startsAt)}</p>
                  </div>
                </div>
                <div className="row">
                  <StatusBadge status={e.status} />
                  <Badge tone="primary" dot={false}>{organizerOf.includes(e.id) ? 'Organizer' : 'Staff'}</Badge>
                </div>
                <div className="actions">
                  {e.status === 'PUBLISHED' && <Button variant="primary" icon={QrCode} to={`/scan/${e.id}`}>Open scanner</Button>}
                  {e.viewerCanManage && <Button to={`/manage/events/${e.id}`}>Manage</Button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
