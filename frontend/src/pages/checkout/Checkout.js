import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, HourglassMedium, XCircle } from '@phosphor-icons/react';
import { paymentsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { useIdempotencyKey } from '../../hooks';
import { Card, DescriptionList, PageHeader } from '../../components/layout';
import { Alert, ErrorState, StatusBadge, PageLoader } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Money, SimulatedBanner } from '../../components/domain';
import { useToast } from '../../components/Toast';
import { formatDate, formatDateTime } from '../../utils/dates';
import { label, sizeLabel } from '../../utils/status';

function useCountdown(until) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const ms = Math.max(0, new Date(until).getTime() - now);
  return { ms, text: `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}` };
}

function nextStep(p) {
  const t = p.target || {};
  const ticketId = t.ticketId ?? p.result?.ticket?.id;
  if (t.kind === 'EVENT_TICKET') {
    return p.status === 'SUCCEEDED'
      ? { to: ticketId ? `/me/tickets/${ticketId}` : '/me/tickets', label: 'View my ticket' }
      : { to: `/events/${t.eventId}`, label: 'Back to event' };
  }
  if (t.kind === 'MERCH_ORDER') return { to: `/me/orders/${t.orderId}`, label: p.status === 'SUCCEEDED' ? 'View order & pickup code' : 'View order' };
  if (t.kind === 'MEMBERSHIP') return { to: `/me/memberships/${t.membershipId}`, label: 'View membership' };
  return { to: '/', label: 'Home' };
}

function Result({ payment }) {
  const ok = payment.status === 'SUCCEEDED';
  const pending = payment.status === 'PENDING';
  const Icon = ok ? CheckCircle : pending ? HourglassMedium : XCircle;
  const tone = ok ? 'success' : pending ? 'warning' : 'danger';
  const step = nextStep(payment);
  const r = payment.result || {};
  return (
    <div className="scan-result" style={{ '--b-fg': `var(--color-${tone})`, '--b-bg': `var(--color-${tone}-soft)` }} role="status">
      <Icon size={56} weight="fill" aria-hidden />
      <h2 style={{ fontSize: 'var(--font-size-2xl)' }}>{ok ? 'Payment successful' : pending ? 'Payment pending' : payment.status === 'EXPIRED' ? 'Hold expired' : 'Payment failed'}</h2>
      <p style={{ fontSize: 'var(--font-size-base)' }}>
        {ok && payment.target?.kind === 'MEMBERSHIP' && <>Your membership is active until {formatDate(r.expiresOn)} · Member no. <span className="mono">{r.memberNumber}</span></>}
        {ok && payment.target?.kind === 'EVENT_TICKET' && 'Your ticket and QR code are ready.'}
        {ok && payment.target?.kind === 'MERCH_ORDER' && <>Pickup code <span className="mono">{r.pickupCode}</span>. Show it at the club desk.</>}
        {pending && 'You can settle it from this page once the simulated bank responds.'}
        {!ok && !pending && 'Nothing was charged. Any held seat or stock was released.'}
      </p>
      <Button variant={ok ? 'primary' : 'secondary'} to={step.to}>
        {step.label}
      </Button>
    </div>
  );
}

export default function Checkout() {
  const { paymentId } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const [getKey, renewKey] = useIdempotencyKey();
  const payment = useQuery({ queryKey: ['payment', paymentId], queryFn: () => paymentsApi.get(paymentId) });
  const countdown = useCountdown(payment.data?.target?.holdExpiresAt);

  const simulate = useMutation({
    mutationFn: (outcome) => paymentsApi.simulate(paymentId, outcome, getKey()),
    onSuccess: (p) => {
      renewKey();
      qc.setQueryData(['payment', paymentId], p);
      ['memberships', 'tickets', 'orders', 'events', 'event', 'products', 'payments'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      refresh();
      if (p.status === 'SUCCEEDED') toast.success('Payment successful');
    },
    onError: (e) => {
      renewKey();
      toast.error(e);
    },
  });

  if (payment.isPending) return <PageLoader />;
  if (payment.isError) return <div className="card"><ErrorState error={payment.error} onRetry={() => payment.refetch()} /></div>;
  const p = payment.data;
  const settled = ['SUCCEEDED', 'FAILED', 'EXPIRED'].includes(p.status);
  const t = p.target || {};

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <PageHeader title="Checkout" description={t.title} badge={<StatusBadge status={p.status} />} />
      <div className="stack">
        <SimulatedBanner>Choose an outcome below to see how the system reacts.</SimulatedBanner>
        <Card title="Order summary">
          <div className="stack">
            {t.items && (
              <ul className="list">
                {t.items.map((i) => (
                  <li key={i.id} className="row-between" style={{ paddingInline: 0 }}>
                    <span>
                      {i.productName} · {sizeLabel(i.sizeLabel)} × <span className="num">{i.quantity}</span>
                    </span>
                    <Money paise={i.lineTotalPaise} />
                  </li>
                ))}
              </ul>
            )}
            <DescriptionList
              items={[
                ['For', label('purpose', p.purpose)],
                t.priceTier && ['Price tier', label('priceTier', t.priceTier)],
                ['Club', t.clubName],
                ['Reference', <span className="mono">{p.reference}</span>],
                ['Created', formatDateTime(p.createdAt)],
              ]}
            />
            <hr className="divider" style={{ margin: 0 }} />
            <div className="row-between">
              <strong>Amount</strong>
              <span className="stat-value" style={{ fontSize: 'var(--font-size-xl)' }}>
                <Money paise={p.amountPaise} />
              </span>
            </div>
          </div>
        </Card>
        {settled || p.status === 'PENDING' ? <Result payment={p} /> : null}
        {!settled && (
          <Card title={p.status === 'PENDING' ? 'Settle the pending payment' : 'Pay'}>
            <div className="stack">
              {countdown && (
                <Alert tone={countdown.ms < 120000 ? 'warning' : 'info'}>
                  <span className="row" style={{ gap: 6 }}>
                    <Clock size={16} aria-hidden /> Held for you for <strong className="num" aria-live="off">{countdown.text}</strong>
                  </span>
                </Alert>
              )}
              <div className="grid grid-3">
                <Button variant="success" icon={CheckCircle} size="lg" loading={simulate.isPending && simulate.variables === 'SUCCEEDED'} disabled={simulate.isPending} onClick={() => simulate.mutate('SUCCEEDED')}>
                  Succeed
                </Button>
                <Button variant="danger" icon={XCircle} size="lg" loading={simulate.isPending && simulate.variables === 'FAILED'} disabled={simulate.isPending} onClick={() => simulate.mutate('FAILED')}>
                  Fail
                </Button>
                {p.status !== 'PENDING' && (
                  <Button icon={HourglassMedium} size="lg" loading={simulate.isPending && simulate.variables === 'PENDING'} disabled={simulate.isPending} onClick={() => simulate.mutate('PENDING')}>
                    Pending
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
