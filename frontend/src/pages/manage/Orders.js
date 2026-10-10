import { useDebounced } from '../../hooks';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, MagnifyingGlass, ShoppingBag, XCircle } from '@phosphor-icons/react';
import { merchApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { newIdempotencyKey } from '../../api/client';
import { Card, PageHeader, Segmented } from '../../components/layout';
import { EmptyState, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable';
import { Field, Input } from '../../components/forms';
import { Money } from '../../components/domain';
import { formatDateTime } from '../../utils/dates';
import { errorMessage } from '../../utils/errorMessages';
import { sizeLabel } from '../../utils/status';

function PickupDesk({ clubId }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const pickup = useMutation({
    mutationFn: (c) => merchApi.pickup(clubId, c, newIdempotencyKey()),
    onSuccess: () => {
      setCode('');
      qc.invalidateQueries({ queryKey: ['club-orders', clubId] });
    },
  });
  const r = pickup.data;
  return (
    <Card title="Pickup desk" description="Enter the buyer's 8-character pickup code.">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) pickup.mutate(code.trim());
        }}
      >
        <Field label="Pickup code">
          <Input className="input mono" style={{ fontSize: 'var(--font-size-lg)', letterSpacing: '0.1em' }} maxLength={8} autoComplete="off" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={pickup.isPending} disabled={code.trim().length < 8}>
          Verify & hand over
        </Button>
      </form>
      {pickup.isError && (
        <div className="scan-result" style={{ '--b-fg': 'var(--color-danger)', '--b-bg': 'var(--color-danger-soft)', marginTop: 'var(--space-4)', padding: 'var(--space-5)' }} role="alert">
          <XCircle size={40} weight="fill" aria-hidden />
          <h2 style={{ fontSize: 'var(--font-size-xl)' }}>{pickup.error.code === 'ALREADY_PICKED_UP' ? 'ALREADY COLLECTED' : pickup.error.code === 'ORDER_NOT_READY' ? 'NOT PAID' : 'NOT FOUND'}</h2>
          <p className="muted" style={{ fontSize: 'var(--font-size-md)' }}>{errorMessage(pickup.error)}{pickup.error.details?.pickedUpAt && ` (${formatDateTime(pickup.error.details.pickedUpAt)} by ${pickup.error.details.pickedUpByName})`}</p>
        </div>
      )}
      {r && !pickup.isError && (
        <div className="scan-result" style={{ '--b-fg': 'var(--color-success)', '--b-bg': 'var(--color-success-soft)', marginTop: 'var(--space-4)', padding: 'var(--space-5)' }} role="status">
          <CheckCircle size={40} weight="fill" aria-hidden />
          <h2 style={{ fontSize: 'var(--font-size-xl)' }}>HAND OVER</h2>
          <p style={{ fontWeight: 700, fontSize: 'var(--font-size-base)' }}>{r.buyerName}</p>
          <ul className="list" style={{ fontSize: 'var(--font-size-md)', width: '100%' }}>
            {r.items.map((i) => (
              <li key={i.id} style={{ padding: '4px 0' }}>{i.productName} · {sizeLabel(i.sizeLabel)} × {i.quantity}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default function ManageOrders() {
  const { clubId } = useParams();
  const { hasRole } = useAuth();
  const [status, setStatus] = useState('CONFIRMED');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useQuery({ queryKey: ['club-orders', clubId, status, dq, page], queryFn: () => merchApi.clubOrders(clubId, { status, q: dq, page, pageSize: 15 }), placeholderData: keepPreviousData });
  const head = hasRole(clubId, 'CLUB_HEAD');
  return (
    <>
      <PageHeader title="Orders & pickup" description="Track paid orders and hand them over with the pickup code." />
      <div className="grid grid-main-side">
        <Card flush>
          <Toolbar>
            <Segmented label="Order status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: 'CONFIRMED', label: 'Ready' }, { value: 'PICKED_UP', label: 'Collected' }, { value: 'PENDING_PAYMENT', label: 'Unpaid' }, { value: '', label: 'All' }]} />
            <div className="input-group grow">
              <MagnifyingGlass size={16} className="prefix" aria-hidden />
              <Input type="search" aria-label="Search orders" placeholder="Buyer or pickup code" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
          </Toolbar>
          <QueryState query={list} isEmpty={(d) => !d.data.length} empty={<EmptyState icon={ShoppingBag} title="No orders in this view" />}>
            {(d) => (
              <>
                <DataTable
                  caption="Club orders"
                  rows={d.data}
                  columns={[
                    { key: 'createdAt', header: 'Placed', sortable: true, render: (o) => formatDateTime(o.createdAt) },
                    { key: 'buyerName', header: 'Buyer', sortable: true, render: (o) => <div><div className="cell-title">{o.buyerName}</div><div className="cell-sub wrap-anywhere">{o.buyerEmail}</div></div> },
                    { key: 'items', header: 'Items', render: (o) => <span className="wrap-anywhere">{o.items.map((i) => `${i.productName} (${sizeLabel(i.sizeLabel)}) ×${i.quantity}`).join(', ')}</span>, hideOnMobile: true },
                    { key: 'totalPaise', header: 'Total', align: 'right', sortable: true, render: (o) => <Money paise={o.totalPaise} /> },
                    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
                    { key: 'pickupCode', header: 'Code', render: (o) => <span className="mono">{o.pickupCode || '–'}</span> },
                  ]}
                />
                <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
              </>
            )}
          </QueryState>
        </Card>
        {head ? <PickupDesk clubId={clubId} /> : <Card title="Pickup desk"><p className="muted">Only the club head can hand over orders.</p></Card>}
      </div>
    </>
  );
}
