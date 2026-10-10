import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { merchApi } from '../../api/endpoints';
import { Card, DescriptionList, PageHeader } from '../../components/layout';
import { Alert, ErrorState, LoadingState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { Money } from '../../components/domain';
import { useToast } from '../../components/Toast';
import { formatDateTime } from '../../utils/dates';
import { label, sizeLabel } from '../../utils/status';

export default function OrderDetail() {
  const { orderId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['order', orderId], queryFn: () => merchApi.myOrder(orderId) });
  const cancel = useMutation({
    mutationFn: () => merchApi.cancelOrder(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order cancelled', 'Reserved stock was released.');
    },
    onError: (e) => toast.error(e),
  });
  if (q.isPending) return <LoadingState rows={8} />;
  if (q.isError) return <div className="card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const o = q.data;
  const pending = o.payments.find((p) => ['INITIATED', 'PENDING'].includes(p.status));
  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'My orders', to: '/me/orders' }, { label: `Order ${o.id.slice(-6).toUpperCase()}` }]} title={`Order ${o.id.slice(-6).toUpperCase()}`} badge={<StatusBadge status={o.status} />} description={`${o.clubName} · placed ${formatDateTime(o.createdAt)}`} />
      <div className="grid grid-main-side">
        <Card title="Items" flush>
          <DataTable
            caption="Order items"
            rows={o.items}
            columns={[
              { key: 'productName', header: 'Product' },
              { key: 'sizeLabel', header: 'Size', render: (i) => sizeLabel(i.sizeLabel) },
              { key: 'quantity', header: 'Qty', align: 'right' },
              { key: 'unitFinalPricePaise', header: 'Unit', align: 'right', render: (i) => <Money paise={i.unitFinalPricePaise} /> },
              { key: 'lineTotalPaise', header: 'Total', align: 'right', render: (i) => <Money paise={i.lineTotalPaise} /> },
            ]}
          />
          <div className="card-body row-between">
            <strong>Order total</strong>
            <span className="price-now"><Money paise={o.totalPaise} /></span>
          </div>
        </Card>
        <div className="stack">
          {o.pickupCode && o.status === 'CONFIRMED' && (
            <Card title="Pickup code">
              <div className="stack">
                <div className="code-display">{o.pickupCode}</div>
                <p className="subtle">Show this code at the club desk to collect your order.</p>
              </div>
            </Card>
          )}
          {o.status === 'PICKED_UP' && <Alert tone="success" title="Collected">Picked up {formatDateTime(o.pickedUpAt)}.</Alert>}
          {o.status === 'PENDING_PAYMENT' && (
            <Card title="Awaiting payment">
              <div className="stack">
                <p className="muted">Stock is reserved for you until {formatDateTime(o.holdExpiresAt)}.</p>
                {pending && <Button variant="primary" to={`/checkout/${pending.id}`}>Pay now</Button>}
                <Button variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel order</Button>
              </div>
            </Card>
          )}
          <Card title="Payments">
            <ul className="list">
              {o.payments.map((p) => (
                <li key={p.id} style={{ paddingInline: 0 }}>
                  <DescriptionList items={[['Status', <StatusBadge status={p.status} />], ['Purpose', label('purpose', p.purpose)], ['Reference', <span className="mono">{p.reference}</span>], ['Date', formatDateTime(p.settledAt || p.createdAt)]]} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
