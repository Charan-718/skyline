import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt } from '@phosphor-icons/react';
import { clubsApi, financeApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Card, PageHeader } from '../../components/layout';
import { Alert, EmptyState, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { Money } from '../../components/domain';
import { ExpenseForm } from '../../components/ExpenseForm';
import { formatDate } from '../../utils/dates';

export default function Expenses() {
  const { managedClubIds, organizerOf } = useAuth();
  const [open, setOpen] = useState(false);
  const clubs = useQuery({ queryKey: ['clubs'], queryFn: () => clubsApi.list() });
  const q = useQuery({ queryKey: ['expenses', 'mine'], queryFn: () => financeApi.myExpenses() });
  const teamClubs = (clubs.data || []).filter((c) => managedClubIds.includes(c.id));
  const canSubmit = teamClubs.length > 0 || organizerOf.length > 0;
  return (
    <>
      <PageHeader
        title="Reimbursements"
        description="Claim money you spent for the club. Track each claim from review to payout."
        actions={canSubmit && <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>New claim</Button>}
      />
      {!canSubmit && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert tone="info">Reimbursement claims are for club volunteers, treasurers, heads and event organizers.</Alert>
        </div>
      )}
      <Card flush>
        <QueryState query={q} empty={<EmptyState icon={Receipt} title="No claims yet">Claims you submit appear here with their status.</EmptyState>}>
          {(rows) => (
            <DataTable
              caption="My reimbursement claims"
              rows={rows}
              columns={[
                { key: 'createdAt', header: 'Submitted', render: (e) => formatDate(e.createdAt), sortable: true, sortValue: (e) => e.createdAt },
                { key: 'title', header: 'Claim', render: (e) => <div><div className="cell-title">{e.title}</div><div className="cell-sub">{e.clubName}{e.eventTitle ? ` · ${e.eventTitle}` : ''}{e.fundraiserName ? ` · ${e.fundraiserName}` : ''}</div></div> },
                { key: 'amountPaise', header: 'Amount', align: 'right', render: (e) => <Money paise={e.amountPaise} />, sortable: true },
                { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
                { key: 'decision', header: 'Decision', hideOnMobile: true, render: (e) => (e.status === 'PAID' ? <span className="subtle">Paid {formatDate(e.paidAt)} · <span className="mono">{e.payoutReference}</span></span> : e.decidedByName ? <span className="subtle">{e.decidedByName}{e.decisionNote ? `: “${e.decisionNote}”` : ''}</span> : <span className="subtle">Awaiting review</span>) },
              ]}
            />
          )}
        </QueryState>
      </Card>
      {open && <ExpenseForm open={open} onClose={() => setOpen(false)} clubs={teamClubs.length ? teamClubs : clubs.data || []} />}
    </>
  );
}
