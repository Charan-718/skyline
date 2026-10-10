import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ShoppingBag } from '@phosphor-icons/react';
import { merchApi } from '../../api/endpoints';
import { Card, PageHeader } from '../../components/layout';
import { EmptyState, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { DataTable, Pagination } from '../../components/DataTable';
import { Money } from '../../components/domain';
import { formatDateTime } from '../../utils/dates';

export default function Orders() {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['orders', 'mine', page], queryFn: () => merchApi.myOrders({ page }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="My orders" description="Merchandise orders, payment status and pickup codes." actions={<Button to="/clubs">Shop clubs</Button>} />
      <Card flush>
        <QueryState query={q} isEmpty={(d) => !d.data.length} empty={<EmptyState icon={ShoppingBag} title="No orders yet">Club merchandise you order appears here.</EmptyState>}>
          {(d) => (
            <>
              <DataTable
                caption="My orders"
                rows={d.data}
                onRowClick={(o) => navigate(`/me/orders/${o.id}`)}
                columns={[
                  { key: 'createdAt', header: 'Placed', render: (o) => formatDateTime(o.createdAt) },
                  { key: 'clubName', header: 'Club', hideOnMobile: true },
                  { key: 'items', header: 'Items', render: (o) => <span className="wrap-anywhere">{o.items.map((i) => `${i.productName} (${i.sizeLabel}) ×${i.quantity}`).join(', ')}</span> },
                  { key: 'totalPaise', header: 'Total', align: 'right', render: (o) => <Money paise={o.totalPaise} /> },
                  { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
                  { key: 'pickupCode', header: 'Pickup code', render: (o) => (o.pickupCode ? <span className="mono">{o.pickupCode}</span> : '–') },
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
