import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarBlank, Clock, GearSix, MapPin, QrCode, Ticket, UsersThree } from '@phosphor-icons/react';
import { eventsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { useIdempotencyKey } from '../../hooks';
import { Card, DescriptionList, PageHeader } from '../../components/layout';
import { Alert, Badge, ErrorState, LoadingState, ProgressBar, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Money } from '../../components/domain';
import { ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { formatDateTime } from '../../utils/dates';
import { formatMoney } from '../../utils/money';
import { label } from '../../utils/status';

const REASON_TEXT = {
  MEMBERS_ONLY_EVENT: 'This event is for club members only.',
  REGISTRATION_NOT_OPEN: 'Registration has not opened yet.',
  REGISTRATION_CLOSED: 'Registration is closed.',
  SOLD_OUT: 'This event is sold out.',
};

function QuoteCard({ event }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [getKey, renewKey] = useIdempotencyKey();
  const [changed, setChanged] = useState(null);
  const quote = useQuery({ queryKey: ['quote', event.id], queryFn: () => eventsApi.quote(event.id), enabled: !!user && !event.viewerBooking });

  const book = useMutation({
    mutationFn: (expected) => eventsApi.book(event.id, { expectedFinalPricePaise: expected }, getKey()),
    onSuccess: (r) => {
      renewKey();
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['event', event.id] });
      if (r.payment) navigate(`/checkout/${r.payment.id}`);
      else {
        toast.success('You’re in!', 'Your free ticket is ready.');
        navigate(`/me/tickets/${r.ticket.id}`);
      }
    },
    onError: (e) => {
      renewKey();
      if (e.code === 'PRICE_CHANGED') {
        setChanged(e.details.quote);
        qc.setQueryData(['quote', event.id], e.details.quote);
      } else toast.error(e);
    },
  });

  if (event.viewerBooking) {
    const b = event.viewerBooking;
    return (
      <Card title="Your booking">
        <div className="stack">
          <StatusBadge status={b.status} />
          {b.status === 'CONFIRMED' ? (
            <Button variant="primary" icon={Ticket} to={`/me/tickets/${b.ticketId}`} block>
              Show my ticket
            </Button>
          ) : (
            <>
              <p className="muted">Your seat is held while you complete payment.</p>
              <Button variant="primary" to={`/checkout/${b.paymentId}`} block>
                Complete payment
              </Button>
            </>
          )}
        </div>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card title="Tickets">
        <div className="stack">
          <PriceTable event={event} />
          <Button variant="primary" size="lg" block to={`/login?next=/events/${event.id}`}>
            Sign in to book
          </Button>
          <p className="subtle">Members see their discounted price after signing in.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Your price" description="Calculated for you by the server, including any member benefits.">
      {quote.isPending ? (
        <LoadingState rows={3} />
      ) : quote.isError ? (
        <ErrorState error={quote.error} onRetry={() => quote.refetch()} />
      ) : (
        <div className="stack">
          <div className="row" style={{ alignItems: 'baseline' }}>
            <span className="stat-value">{quote.data.finalPricePaise == null ? '–' : quote.data.finalPricePaise === 0 ? 'Free' : formatMoney(quote.data.finalPricePaise)}</span>
            {quote.data.discountPaise > 0 && <span className="price-old">{formatMoney(quote.data.listPricePaise)}</span>}
          </div>
          <div className="row">
            <Badge tone={quote.data.buyerType === 'MEMBER' ? 'success' : 'neutral'}>{label('buyerType', quote.data.buyerType)}</Badge>
            {quote.data.priceTier && <Badge tone={quote.data.priceTier.includes('EARLY') ? 'accent' : 'info'} dot={false}>{label('priceTier', quote.data.priceTier)}</Badge>}
          </div>
          {quote.data.discountPaise > 0 && (
            <p className="subtle">
              Member discount saves you <Money paise={quote.data.discountPaise} />.
            </p>
          )}
          {!quote.data.eligible && <Alert tone="warning">{REASON_TEXT[quote.data.reason] || 'Booking is not available.'}</Alert>}
          {quote.data.salesStatus === 'EARLY_ACCESS' && <p className="subtle">Members with early access can book now; general registration opens {formatDateTime(event.registrationOpensAt)}.</p>}
          <Button variant="primary" size="lg" block icon={Ticket} disabled={!quote.data.eligible} loading={book.isPending} onClick={() => book.mutate(quote.data.finalPricePaise)}>
            {quote.data.finalPricePaise === 0 ? 'Get free ticket' : 'Book ticket'}
          </Button>
          <p className="subtle">One ticket per person. Your seat is held for 15 minutes during payment.</p>
        </div>
      )}
      <ConfirmDialog
        open={!!changed}
        onClose={() => setChanged(null)}
        title="The price has changed"
        confirmLabel={`Book at ${changed ? formatMoney(changed.finalPricePaise) : ''}`}
        loading={book.isPending}
        onConfirm={() => {
          const p = changed.finalPricePaise;
          setChanged(null);
          book.mutate(p);
        }}
      >
        The ticket price was updated since you opened this page. The new price is <strong>{changed && formatMoney(changed.finalPricePaise)}</strong> ({changed && label('priceTier', changed.priceTier)}). Do you want to continue?
      </ConfirmDialog>
    </Card>
  );
}

function PriceTable({ event }) {
  const rows = [
    ['Member', event.memberPricePaise],
    event.earlyBirdMemberPricePaise != null && ['Member early-bird', event.earlyBirdMemberPricePaise],
    ['Non-member', event.nonMemberPricePaise],
    event.earlyBirdNonMemberPricePaise != null && ['Non-member early-bird', event.earlyBirdNonMemberPricePaise],
  ].filter(Boolean);
  return <DescriptionList items={rows.map(([k, v]) => [k, v == null ? 'Members only' : v === 0 ? 'Free' : <Money paise={v} />])} />;
}

export default function EventDetail() {
  const { eventId } = useParams();
  const event = useQuery({ queryKey: ['event', eventId], queryFn: () => eventsApi.get(eventId) });

  if (event.isPending) return <LoadingState rows={8} />;
  if (event.isError) return <div className="card"><ErrorState error={event.error} onRetry={() => event.refetch()} /></div>;
  const e = event.data;
  const soldPct = (e.seatsReserved / e.capacity) * 100;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Events', to: '/events' }, { label: e.title }]}
        title={e.title}
        badge={<StatusBadge status={e.status === 'PUBLISHED' ? e.salesStatus : e.status} />}
        description={<Link to={`/clubs/${e.clubSlug}`}>{e.clubName}</Link>}
        actions={
          <>
            {e.viewerCanScan && e.status === 'PUBLISHED' && (
              <Button icon={QrCode} to={`/scan/${e.id}`}>
                Scan tickets
              </Button>
            )}
            {e.viewerCanManage && (
              <Button icon={GearSix} to={`/manage/events/${e.id}`}>
                Manage
              </Button>
            )}
          </>
        }
      />
      {e.status === 'CANCELLED' && <Alert tone="danger" title="This event was cancelled">{e.cancelReason}</Alert>}
      <div className="grid grid-main-side" style={{ marginTop: e.status === 'CANCELLED' ? 'var(--space-4)' : 0 }}>
        <div className="stack">
          <Card title="About this event">
            <div className="stack">
              <p className="prewrap">{e.description}</p>
              <hr className="divider" style={{ margin: 0 }} />
              <DescriptionList
                items={[
                  [<span className="row" style={{ gap: 6 }}><CalendarBlank size={16} aria-hidden />Starts</span>, formatDateTime(e.startsAt)],
                  [<span className="row" style={{ gap: 6 }}><Clock size={16} aria-hidden />Ends</span>, formatDateTime(e.endsAt)],
                  [<span className="row" style={{ gap: 6 }}><MapPin size={16} aria-hidden />Venue</span>, e.venue],
                  ['Registration', `${formatDateTime(e.registrationOpensAt)} – ${formatDateTime(e.registrationClosesAt)}`],
                  e.earlyAccessOpensAt && ['Member early access', `From ${formatDateTime(e.earlyAccessOpensAt)}`],
                  e.earlyBirdEndsAt && ['Early-bird ends', `${formatDateTime(e.earlyBirdEndsAt)}${e.earlyBirdRemaining != null ? ` · ${e.earlyBirdRemaining} left` : ''}`],
                  e.organizers.length > 0 && ['Organizers', e.organizers.map((o) => o.fullName).join(', ')],
                ]}
              />
            </div>
          </Card>
          <Card title="Prices">
            <PriceTable event={e} />
          </Card>
        </div>
        <div className="stack">
          {e.status === 'PUBLISHED' && <QuoteCard event={e} />}
          <Card>
            <div className="stack-sm">
              <span className="stat-label">
                <UsersThree size={16} aria-hidden /> Capacity
              </span>
              <ProgressBar value={soldPct} label={`${e.remainingSeats} of ${e.capacity} seats left`} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
