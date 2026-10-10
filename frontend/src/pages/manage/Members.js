import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MagnifyingGlass, Users } from '@phosphor-icons/react';
import { membershipsApi, reportsApi } from '../../api/endpoints';
import { Card, PageHeader, StatCard } from '../../components/layout';
import { CardsSkeleton, EmptyState, QueryState, StatusBadge, Badge } from '../../components/feedback';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable';
import { Input, Select } from '../../components/forms';
import { Money } from '../../components/domain';
import { formatDate } from '../../utils/dates';
import { useDebounced } from './useDebounced';

export default function Members() {
  const { clubId } = useParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [planId, setPlanId] = useState('');
  const [expiring, setExpiring] = useState(false);
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const report = useQuery({ queryKey: ['reports', 'memberships', clubId], queryFn: () => reportsApi.memberships(clubId) });
  const plans = useQuery({ queryKey: ['plans', clubId, 'all'], queryFn: () => membershipsApi.plans(clubId, { includeArchived: true }) });
  const list = useQuery({
    queryKey: ['members', clubId, dq, status, planId, expiring, page],
    queryFn: () => membershipsApi.clubMembers(clubId, { q: dq, status, planId, expiringWithin: expiring ? 7 : undefined, page, pageSize: 15 }),
    placeholderData: keepPreviousData,
  });
  const reset = (fn) => (e) => {
    fn(e.target.type === 'checkbox' ? e.target.checked : e.target.value);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Members" description="Membership status, dues and college verification for this club." />
      <div className="stack-lg">
        <QueryState query={report} loading={<CardsSkeleton count={4} />}>
          {(r) => (
            <div className="grid grid-4">
              <StatCard label="Active members" value={r.activeMembers} tone="success" icon={Users} />
              <StatCard label="Expiring in 7 days" value={r.expiringIn7Days} tone="warning" hint="Reminders go out by email" />
              <StatCard label="Expired" value={r.expiredMembers} tone="danger" />
              <StatCard label="Dues collected" value={<Money paise={r.duesCollectedPaise} />} tone="info" hint={`${r.autopayEnabled} on AutoPay`} />
            </div>
          )}
        </QueryState>
        <Card flush>
          <Toolbar>
            <div className="input-group grow">
              <MagnifyingGlass size={16} className="prefix" aria-hidden />
              <Input type="search" aria-label="Search members" placeholder="Search name, email or member no." value={q} onChange={reset(setQ)} />
            </div>
            <Select aria-label="Status" value={status} onChange={reset(setStatus)} placeholder="Any status" options={['ACTIVE', 'EXPIRED', 'PENDING_PAYMENT', 'CANCELLED'].map((s) => ({ value: s, label: s.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }))} style={{ width: 'auto' }} />
            <Select aria-label="Plan" value={planId} onChange={reset(setPlanId)} placeholder="Any plan" options={(plans.data || []).map((p) => ({ value: p.id, label: p.name }))} style={{ width: 'auto' }} />
            <label className="check">
              <input type="checkbox" checked={expiring} onChange={reset(setExpiring)} /> Expiring within 7 days
            </label>
          </Toolbar>
          <QueryState query={list} isEmpty={(d) => !d.data.length} empty={<EmptyState icon={Users} title="No members match">Try clearing the filters.</EmptyState>}>
            {(d) => (
              <>
                <DataTable
                  caption="Club members"
                  rows={d.data}
                  initialSort={{ key: 'fullName', dir: 'asc' }}
                  columns={[
                    { key: 'fullName', header: 'Member', sortable: true, render: (m) => <div><div className="cell-title">{m.fullName}</div><div className="cell-sub wrap-anywhere">{m.email}</div></div> },
                    { key: 'memberNumber', header: 'Member no.', render: (m) => <span className="mono">{m.memberNumber || '–'}</span>, hideOnMobile: true },
                    { key: 'planName', header: 'Plan', sortable: true },
                    { key: 'effectiveStatus', header: 'Status', render: (m) => <StatusBadge status={m.effectiveStatus} /> },
                    { key: 'expiresOn', header: 'Expires', sortable: true, render: (m) => (m.expiresOn ? <span>{formatDate(m.expiresOn)}{m.effectiveStatus === 'ACTIVE' && m.daysToExpiry <= 7 && <> <Badge tone="warning" dot={false}>{m.daysToExpiry}d</Badge></>}</span> : '–') },
                    { key: 'verificationStatus', header: 'Verification', render: (m) => <StatusBadge status={m.verificationStatus} />, hideOnMobile: true },
                    { key: 'autopayEnabled', header: 'AutoPay', render: (m) => (m.autopayEnabled ? 'On' : 'Off'), hideOnMobile: true },
                  ]}
                />
                <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
              </>
            )}
          </QueryState>
        </Card>
      </div>
    </>
  );
}
