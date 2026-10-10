import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { eventsApi } from '../../api/endpoints';
import { DescriptionList, PageHeader } from '../../components/layout';
import { Alert, ErrorState, StatusBadge, PageLoader } from '../../components/feedback';
import { Money, QrCode } from '../../components/domain';
import { formatDateTime } from '../../utils/dates';
import { label } from '../../utils/status';

export default function TicketDetail() {
  const { ticketId } = useParams();
  const q = useQuery({ queryKey: ['ticket', ticketId], queryFn: () => eventsApi.myTicket(ticketId) });
  if (q.isPending) return <PageLoader />;
  if (q.isError) return <div className="card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const t = q.data;
  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'My tickets', to: '/me/tickets' }, { label: t.event.title }]} title={t.event.title} badge={<StatusBadge status={t.status} />} description={`${t.event.venue} · ${formatDateTime(t.event.startsAt)}`} />
      <div className="id-card">
        <div className="id-card-top">
          <p>{t.event.clubName}</p>
          <h2>{t.holderName}</h2>
          <p>{label('buyerType', t.booking.buyerType)} · {label('priceTier', t.booking.priceTier)}</p>
        </div>
        <div className="card-body stack" style={{ alignItems: 'center' }}>
          {t.status === 'VALID' && t.qrPayload ? (
            <>
              <QrCode value={t.qrPayload} size={240} label={`Ticket QR code for ${t.event.title}`} />
              <p className="subtle">Turn up your screen brightness at the door.</p>
            </>
          ) : t.status === 'USED' ? (
            <Alert tone="info" title="Already checked in">Scanned {formatDateTime(t.usedAt)}.</Alert>
          ) : (
            <Alert tone="danger" title="Ticket cancelled">This event was cancelled. Contact the club for settlement.</Alert>
          )}
          <div className="stack-sm" style={{ width: '100%' }}>
            <span className="label">Ticket code (for manual entry)</span>
            <div className="code-display">{t.ticketCode}</div>
          </div>
          <div style={{ width: '100%' }}>
            <DescriptionList items={[['Paid', t.booking.finalPricePaise === 0 ? 'Free' : <Money paise={t.booking.finalPricePaise} />], ['Starts', formatDateTime(t.event.startsAt)], ['Venue', t.event.venue]]} />
          </div>
        </div>
      </div>
    </>
  );
}
