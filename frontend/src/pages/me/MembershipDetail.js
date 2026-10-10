import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowsClockwise, QrCode } from '@phosphor-icons/react';
import { membershipsApi } from '../../api/endpoints';
import { Card, DescriptionList, PageHeader } from '../../components/layout';
import { Alert, Badge, ErrorState, LoadingState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Money } from '../../components/domain';
import { DataTable } from '../../components/DataTable';
import { Checkbox, Field, Select } from '../../components/forms';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { formatDate, formatDateTime } from '../../utils/dates';
import { label } from '../../utils/status';
import JoinDialog from '../public/JoinDialog';

const CONSENT_VERSION = 'v1';

function AutopayCard({ m }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState(m.autopay.planId || m.renewalOptions[0]?.planId || '');
  const [ack, setAck] = useState(false);
  const plan = m.renewalOptions.find((p) => p.planId === planId);
  const mutate = useMutation({
    mutationFn: (body) => membershipsApi.setAutopay(m.id, body),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['membership', m.id] });
      setOpen(false);
      toast.success(r.enabled ? 'AutoPay enabled' : 'AutoPay turned off');
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card title="AutoPay renewal" description="Simulated automatic renewal on your expiry date.">
      <div className="stack">
        <div className="row">
          <Badge tone={m.autopay.enabled ? 'success' : 'neutral'}>{m.autopay.enabled ? 'On' : 'Off'}</Badge>
          {m.autopay.enabled && (
            <span className="subtle">
              Next attempt {formatDate(m.autopay.nextAttemptOn)} · <Money paise={m.autopay.amountPaise} />
            </span>
          )}
        </div>
        {m.autopay.enabled ? (
          <Button variant="secondary" loading={mutate.isPending} onClick={() => mutate.mutate({ enabled: false })}>
            Turn off AutoPay
          </Button>
        ) : (
          <Button variant="primary" disabled={m.effectiveStatus !== 'ACTIVE'} onClick={() => setOpen(true)}>
            Set up AutoPay
          </Button>
        )}
        {m.effectiveStatus !== 'ACTIVE' && !m.autopay.enabled && <p className="subtle">Available on an active membership.</p>}
        {m.consents.length > 0 && (
          <details>
            <summary className="subtle" style={{ cursor: 'pointer' }}>Consent history ({m.consents.length})</summary>
            <ul className="list" style={{ fontSize: 'var(--font-size-sm)' }}>
              {m.consents.map((c) => (
                <li key={c.id} style={{ paddingInline: 0 }}>
                  <StatusBadge status={c.status === 'ENABLED' ? 'ACTIVE' : 'CANCELLED'} label={c.status === 'ENABLED' ? 'Enabled' : 'Disabled'} /> {formatDateTime(c.createdAt)} · <Money paise={c.consentedAmountPaise} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Set up AutoPay"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!ack || !plan} loading={mutate.isPending} onClick={() => mutate.mutate({ enabled: true, planId, consentTextVersion: CONSENT_VERSION, acknowledgeSimulated: true })}>
              Enable AutoPay
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Renew into plan">
            <Select value={planId} onChange={(e) => setPlanId(e.target.value)} options={m.renewalOptions.map((p) => ({ value: p.planId, label: `${p.name}: ₹${p.feePaise / 100} for ${p.durationMonths} months` }))} />
          </Field>
          <Alert tone="info">
            On <strong>{formatDate(m.expiresOn)}</strong> we will attempt one renewal for <strong>{plan && <Money paise={plan.feePaise} />}</strong>. If the plan price changes or the plan is withdrawn, AutoPay is skipped and you will be notified.
          </Alert>
          <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} label="I understand AutoPay is simulated in this system and no real money is debited." />
        </div>
      </Modal>
    </Card>
  );
}

export default function MembershipDetail() {
  const { membershipId } = useParams();
  const [renewOpen, setRenewOpen] = useState(false);
  const q = useQuery({ queryKey: ['membership', membershipId], queryFn: () => membershipsApi.detail(membershipId) });
  if (q.isPending) return <LoadingState rows={8} />;
  if (q.isError) return <div className="card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const m = q.data;
  const b = m.benefits;
  const canRenew = ['ACTIVE', 'EXPIRED'].includes(m.effectiveStatus) && !m.pendingPayment;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'My memberships', to: '/me/memberships' }, { label: m.clubName }]}
        title={m.clubName}
        badge={<StatusBadge status={m.effectiveStatus} />}
        description={m.memberNumber ? <>Member no. <span className="mono">{m.memberNumber}</span></> : 'Not yet activated'}
        actions={
          <>
            {m.memberNumber && <Button icon={QrCode} to={`/me/memberships/${m.id}/card`}>Digital ID</Button>}
            {canRenew && <Button variant="primary" icon={ArrowsClockwise} onClick={() => setRenewOpen(true)}>Renew</Button>}
            {m.pendingPayment && <Button variant="primary" to={`/checkout/${m.pendingPayment.id}`}>Complete payment</Button>}
          </>
        }
      />
      {m.effectiveStatus === 'ACTIVE' && m.daysToExpiry <= 7 && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert tone="warning" title={`Expires in ${m.daysToExpiry} day${m.daysToExpiry === 1 ? '' : 's'}`}>
            Renewing now extends from your current expiry date, so you will not lose any days.
          </Alert>
        </div>
      )}
      <div className="grid grid-main-side">
        <div className="stack">
          <Card title="Current benefits">
            {b ? (
              <div className="stack">
                <ol className="numbered">
                  {b.benefitsText.split('\n').filter(Boolean).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
                <DescriptionList items={[['Plan', b.planName], ['Event discount', `${b.eventDiscountBps / 100}%`], ['Merchandise discount', `${b.merchDiscountBps / 100}%`], ['Early access', b.earlyBirdAccess ? 'Yes' : 'No'], ['Valid until', formatDate(m.expiresOn)]]} />
              </div>
            ) : (
              <p className="muted">No active benefits. {canRenew ? 'Renew to restore member pricing.' : ''}</p>
            )}
          </Card>
          <Card title="Membership history" flush>
            <DataTable
              caption="Membership terms"
              rows={m.terms}
              columns={[
                { key: 'kind', header: 'Type', render: (t) => (t.kind === 'JOIN' ? 'Joined' : `Renewal${t.source === 'AUTOPAY' ? ' (AutoPay)' : ''}`) },
                { key: 'planName', header: 'Plan' },
                { key: 'period', header: 'Period', render: (t) => (t.startsOn ? `${formatDate(t.startsOn)} – ${formatDate(t.endsOn)}` : '–') },
                { key: 'feePaise', header: 'Fee', align: 'right', render: (t) => <Money paise={t.feePaise} /> },
                { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
              ]}
            />
          </Card>
          <Card title="Payments" flush>
            <DataTable
              caption="Membership payments"
              rows={m.payments}
              empty={<p className="muted card-body">No payments yet.</p>}
              columns={[
                { key: 'createdAt', header: 'Date', render: (p) => formatDateTime(p.createdAt) },
                { key: 'purpose', header: 'For', render: (p) => label('purpose', p.purpose) },
                { key: 'reference', header: 'Reference', render: (p) => <span className="mono">{p.reference}</span>, hideOnMobile: true },
                { key: 'amountPaise', header: 'Amount', align: 'right', render: (p) => <Money paise={p.amountPaise} /> },
                { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
              ]}
            />
          </Card>
        </div>
        <div className="stack">
          <AutopayCard m={m} />
          <Card title="Details">
            <DescriptionList items={[['Member since', formatDate(m.startedOn)], ['Expires', formatDate(m.expiresOn)], ['Plan', m.planName]]} />
          </Card>
        </div>
      </div>
      {renewOpen && <JoinDialog open={renewOpen} onClose={() => setRenewOpen(false)} club={{ id: m.clubId, name: m.clubName }} membershipId={m.id} />}
    </>
  );
}
