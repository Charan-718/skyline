import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ticket } from '@phosphor-icons/react';
import { eventsApi } from '../../api/endpoints';
import { PageHeader, Segmented } from '../../components/layout';
import { CardsSkeleton, EmptyState, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { DateTile } from '../../components/domain';
import { formatDateTime } from '../../utils/dates';
import { label } from '../../utils/status';

export default function Tickets() {
  const [view, setView] = useState('upcoming');
  const q = useQuery({ queryKey: ['tickets', 'mine'], queryFn: () => eventsApi.myTickets() });
  const now = new Date().toISOString();
  return (
    <>
      <PageHeader title="My tickets" description="Show the QR code at the door. Each ticket can be scanned once." actions={<Segmented label="Show" value={view} onChange={setView} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />} />
      <QueryState query={q} loading={<CardsSkeleton count={3} />} isEmpty={(rows) => !rows.filter((t) => (view === 'upcoming' ? t.event.endsAt >= now : t.event.endsAt < now)).length} empty={<div className="card"><EmptyState icon={Ticket} title={view === 'upcoming' ? 'No upcoming tickets' : 'No past tickets'} action={<Button variant="primary" to="/events">Find events</Button>} /></div>}>
        {(rows) => (
          <div className="grid grid-3">
            {rows
              .filter((t) => (view === 'upcoming' ? t.event.endsAt >= now : t.event.endsAt < now))
              .map((t) => (
                <article key={t.id} className="card">
                  <div className="card-body stack">
                    <div className="row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                      <DateTile iso={t.event.startsAt} />
                      <div style={{ minWidth: 0 }}>
                        <h2 className="wrap-anywhere" style={{ fontSize: 'var(--font-size-base)' }}>{t.event.title}</h2>
                        <p className="subtle">{t.event.venue} · {formatDateTime(t.event.startsAt)}</p>
                      </div>
                    </div>
                    <div className="row">
                      <StatusBadge status={t.status} />
                      <span className="subtle">{label('priceTier', t.booking.priceTier)}</span>
                    </div>
                    {t.pending ? (
                      <Button variant="primary" to={`/checkout/${t.paymentId}`}>Complete payment</Button>
                    ) : (
                      <Button variant={t.status === 'VALID' ? 'primary' : 'secondary'} to={`/me/tickets/${t.id}`}>
                        {t.status === 'VALID' ? 'Show QR ticket' : 'View ticket'}
                      </Button>
                    )}
                  </div>
                </article>
              ))}
          </div>
        )}
      </QueryState>
    </>
  );
}
