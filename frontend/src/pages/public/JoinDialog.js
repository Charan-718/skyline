import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { membershipsApi } from '../../api/endpoints';
import { useIdempotencyKey } from '../../hooks';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Alert, ErrorState, LoadingState, Badge } from '../../components/feedback';
import { Money } from '../../components/domain';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../auth/AuthProvider';
import { errorMessage } from '../../utils/errorMessages';

/** Plan selection → POST /clubs/:id/memberships → simulated checkout. Also used for renewals. */
export default function JoinDialog({ open, onClose, club, membershipId }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const [getKey, renewKey] = useIdempotencyKey();
  const [planId, setPlanId] = useState(null);
  const plans = useQuery({ queryKey: ['plans', club.id], queryFn: () => membershipsApi.plans(club.id), enabled: open });
  const selected = plans.data?.find((p) => p.id === planId) || plans.data?.[0];

  const join = useMutation({
    mutationFn: () =>
      membershipId
        ? membershipsApi.renew(membershipId, { planId: selected.id, expectedFeePaise: selected.feePaise }, getKey())
        : membershipsApi.join(club.id, { planId: selected.id, expectedFeePaise: selected.feePaise }, getKey()),
    onSuccess: async (r) => {
      renewKey();
      qc.invalidateQueries({ queryKey: ['memberships'] });
      await refresh();
      if (r.payment) navigate(`/checkout/${r.payment.id}`);
      else {
        toast.success('Membership active', 'Welcome to the club!');
        onClose();
      }
    },
    onError: (e) => {
      renewKey();
      if (e.code === 'PRICE_CHANGED') qc.invalidateQueries({ queryKey: ['plans', club.id] });
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      title={membershipId ? `Renew your ${club.name} membership` : `Join ${club.name}`}
      description="Choose a plan. Benefits apply to tickets and merchandise automatically."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!selected} loading={join.isPending} onClick={() => join.mutate()}>
            {selected ? (selected.feePaise ? <>Continue to payment · <Money paise={selected.feePaise} /></> : 'Join for free') : 'Continue'}
          </Button>
        </>
      }
    >
      {plans.isPending ? (
        <LoadingState rows={4} />
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      ) : (
        <div className="stack" role="radiogroup" aria-label="Membership plans">
          {join.isError && <Alert tone={join.error.code === 'PRICE_CHANGED' ? 'warning' : 'danger'}>{errorMessage(join.error)}</Alert>}
          {plans.data.map((p) => {
            const active = selected?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPlanId(p.id)}
                className="card"
                style={{ textAlign: 'left', padding: 'var(--space-4)', borderColor: active ? 'var(--color-primary)' : undefined, boxShadow: active ? '0 0 0 3px var(--color-primary-soft)' : undefined, background: 'var(--color-surface)' }}
              >
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div className="row">
                      <h3>{p.name}</h3>
                      {p.earlyBirdAccess && <Badge tone="accent" dot={false}>Early access</Badge>}
                    </div>
                    <p className="subtle">{p.description}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="price-now">{p.feePaise ? <Money paise={p.feePaise} /> : 'Free'}</div>
                    <div className="subtle">{p.durationMonths} months</div>
                  </div>
                </div>
                <ol className="numbered" style={{ marginTop: 'var(--space-3)' }}>
                  {p.benefitsText.split('\n').filter(Boolean).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ol>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
