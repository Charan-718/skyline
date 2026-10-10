import { useQuery } from '@tanstack/react-query';
import { IdentificationBadge, QrCode } from '@phosphor-icons/react';
import { membershipsApi } from '../../api/endpoints';
import { PageHeader } from '../../components/layout';
import { Alert, CardsSkeleton, EmptyState, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { formatDate } from '../../utils/dates';

export default function Memberships() {
  const list = useQuery({ queryKey: ['memberships', 'mine'], queryFn: () => membershipsApi.mine() });
  return (
    <>
      <PageHeader title="My memberships" description="Status, benefits and renewals for every club you belong to." actions={<Button to="/clubs">Find clubs</Button>} />
      <QueryState query={list} loading={<CardsSkeleton count={3} />} empty={<div className="card"><EmptyState icon={IdentificationBadge} title="No memberships yet" action={<Button variant="primary" to="/clubs">Browse clubs</Button>}>Join a club to get member prices on tickets and merchandise.</EmptyState></div>}>
        {(rows) => (
          <div className="grid grid-3">
            {rows.map((m) => (
              <article key={m.id} className="card">
                <div className="card-body stack">
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <h2>{m.clubName}</h2>
                      <p className="subtle">{m.planName ? `${m.planName} plan` : 'No active plan'}{m.memberNumber && <> · <span className="mono">{m.memberNumber}</span></>}</p>
                    </div>
                    <StatusBadge status={m.effectiveStatus} />
                  </div>
                  {m.effectiveStatus === 'ACTIVE' && m.daysToExpiry <= 7 && (
                    <Alert tone="warning">Expires in {m.daysToExpiry} day{m.daysToExpiry === 1 ? '' : 's'}{m.autopayEnabled ? '. AutoPay will renew it.' : '. Renew to keep your benefits.'}</Alert>
                  )}
                  {m.expiresOn && <p className="muted">{m.effectiveStatus === 'EXPIRED' ? 'Expired' : 'Valid until'} {formatDate(m.expiresOn)}</p>}
                  <div className="actions">
                    <Button variant="primary" to={`/me/memberships/${m.id}`}>
                      {m.effectiveStatus === 'EXPIRED' ? 'Renew' : 'Details'}
                    </Button>
                    {m.memberNumber && (
                      <Button icon={QrCode} to={`/me/memberships/${m.id}/card`}>
                        Card
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </QueryState>
    </>
  );
}
