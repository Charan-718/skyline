import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CreditCard } from '@phosphor-icons/react';
import { paymentsApi } from '../../api/endpoints';
import { Card, PageHeader } from '../../components/layout';
import { EmptyState, QueryState, StatusBadge } from '../../components/feedback';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable';
import { Select } from '../../components/forms';
import { Button } from '../../components/Button';
import { Money } from '../../components/domain';
import { formatDateTime } from '../../utils/dates';

export default function Payments() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['payments', 'mine', page, status], queryFn: () => paymentsApi.mine({ page, status }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Payment history" description="Every simulated payment you have made, including failed attempts." />
      <Card flush>
        <Toolbar>
          <Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={['SUCCEEDED', 'PENDING', 'INITIATED', 'FAILED', 'EXPIRED'].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} style={{ width: 'auto' }} />
        </Toolbar>
        <QueryState query={q} isEmpty={(d) => !d.data.length} empty={<EmptyState icon={CreditCard} title="No payments" />}>
          {(d) => (
            <>
              <DataTable
                caption="Payments"
                rows={d.data}
                columns={[
                  { key: 'createdAt', header: 'Date', render: (p) => formatDateTime(p.createdAt), sortable: true },
                  { key: 'title', header: 'For', render: (p) => <span className="wrap-anywhere">{p.target?.title}</span> },
                  { key: 'reference', header: 'Reference', render: (p) => <span className="mono">{p.reference}</span>, hideOnMobile: true },
                  { key: 'amountPaise', header: 'Amount', align: 'right', render: (p) => <Money paise={p.amountPaise} />, sortable: true },
                  { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                  { key: 'act', header: <span className="sr-only">Actions</span>, render: (p) => (['INITIATED', 'PENDING'].includes(p.status) && p.method === 'SIMULATED' ? <Button size="sm" to={`/checkout/${p.id}`}>Pay</Button> : null) },
                ]}
              />
              <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </>
  );
}
