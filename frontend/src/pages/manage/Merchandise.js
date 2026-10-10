import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowsDownUp, Bell, Package, PencilSimple, Plus, Stack, Trash, TShirt } from '@phosphor-icons/react';
import { merchApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { useIdempotencyKey } from '../../hooks';
import { Card, PageHeader, TabPanel, Tabs } from '../../components/layout';
import { Alert, Badge, EmptyState, QueryState, StatusBadge } from '../../components/feedback';
import { Button, IconButton } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { Checkbox, Field, Input, MoneyInput, Select, Textarea, required, useForm } from '../../components/forms';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/domain';
import { useToast } from '../../components/Toast';
import { formatDateTime, fromLocalInput, toLocalInput } from '../../utils/dates';
import { paiseToRupeesInput, rupeesToPaise } from '../../utils/money';
import { sizeLabel } from '../../utils/status';
import { errorMessage } from '../../utils/errorMessages';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'ONE_SIZE'];
const NEXT_STATUS = { DRAFT: [['ACTIVE', 'Put on sale']], ACTIVE: [['INACTIVE', 'Pause sales']], INACTIVE: [['ACTIVE', 'Resume sales']] };

function ProductDialog({ open, onClose, clubId, product }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [newCat, setNewCat] = useState('');
  const cats = useQuery({ queryKey: ['categories', clubId], queryFn: () => merchApi.categories(clubId), enabled: open });
  const form = useForm({});
  const [variants, setVariants] = useState([{ sizeLabel: 'M', initialStock: '10', lowStockThreshold: '5' }]);
  useEffect(() => {
    if (!open) return;
    form.setErrors({});
    form.setValues({
      name: product?.name || '', description: product?.description || '', categoryId: product?.categoryId || '', price: paiseToRupeesInput(product?.pricePaise ?? null),
      memberDiscountEligible: product ? product.memberDiscountEligible : true, availableToNonMembers: product ? product.availableToNonMembers : true,
      offerPrice: paiseToRupeesInput(product?.offerPricePaise ?? null), offerStartsAt: toLocalInput(product?.offerStartsAt), offerEndsAt: toLocalInput(product?.offerEndsAt),
    });
    setVariants([{ sizeLabel: 'M', initialStock: '10', lowStockThreshold: '5' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);
  const addCat = useMutation({
    mutationFn: () => merchApi.createCategory(clubId, newCat),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['categories', clubId] });
      form.set('categoryId', c.id);
      setNewCat('');
    },
    onError: (e) => toast.error(e),
  });
  const save = useMutation({
    mutationFn: (body) => (product ? merchApi.updateProduct(product.id, body) : merchApi.createProduct(clubId, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', clubId] });
      qc.invalidateQueries({ queryKey: ['inventory', clubId] });
      toast.success(product ? 'Product updated' : 'Product created', product ? undefined : 'Saved as a draft. Put it on sale when ready.');
      onClose();
    },
    onError: (e) => {
      const f = e.details?.fields || {};
      form.setErrors({ ...f, price: f.pricePaise, offerPrice: f.offerPricePaise });
    },
  });
  const submit = (e) => {
    e.preventDefault();
    const v = form.values;
    const ok = form.validate({
      name: required('Enter a product name.'),
      categoryId: required('Choose a category.'),
      price: (x) => (!rupeesToPaise(x) ? 'Enter a price above zero.' : null),
      offerPrice: (x) => (x && rupeesToPaise(x) == null ? 'Enter a valid amount.' : x && (!v.offerStartsAt || !v.offerEndsAt) ? 'Set when the offer starts and ends.' : null),
    });
    if (!ok) return;
    if (!product && (!variants.length || variants.some((x) => !/^\d+$/.test(x.initialStock)))) {
      form.setErrors((x) => ({ ...x, variants: 'Each size needs a stock quantity (0 or more).' }));
      return;
    }
    const body = {
      name: v.name, description: v.description, categoryId: v.categoryId, pricePaise: rupeesToPaise(v.price), memberDiscountEligible: !!v.memberDiscountEligible, availableToNonMembers: !!v.availableToNonMembers,
      offerPricePaise: v.offerPrice ? rupeesToPaise(v.offerPrice) : null, offerStartsAt: v.offerPrice ? fromLocalInput(v.offerStartsAt) : null, offerEndsAt: v.offerPrice ? fromLocalInput(v.offerEndsAt) : null,
    };
    if (!product) body.variants = variants.map((x) => ({ sizeLabel: x.sizeLabel, initialStock: +x.initialStock, lowStockThreshold: +(x.lowStockThreshold || 0) }));
    save.mutate(body);
  };
  const used = variants.map((x) => x.sizeLabel);
  return (
    <Modal open={open} onClose={onClose} width={680} title={product ? `Edit ${product.name}` : 'New product'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="product-form" loading={save.isPending}>{product ? 'Save' : 'Create product'}</Button></>}>
      <form id="product-form" className="form-grid" onSubmit={submit} noValidate>
        {save.isError && !Object.keys(save.error.details?.fields || {}).length && <div className="full"><Alert tone="danger">{errorMessage(save.error)}</Alert></div>}
        <Field label="Name" error={form.errors.name} required className="full">
          <Input {...form.bind('name')} />
        </Field>
        <Field label="Category" error={form.errors.categoryId} required>
          <Select {...form.bind('categoryId')} placeholder="Choose…" options={(cats.data || []).map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field label="Or add a category">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Stationery" />
            <Button disabled={!newCat.trim()} loading={addCat.isPending} onClick={() => addCat.mutate()}>Add</Button>
          </div>
        </Field>
        <Field label="Price" error={form.errors.price} required hint="All sizes share this price.">
          <MoneyInput {...form.bind('price')} />
        </Field>
        <Field label="Offer price" error={form.errors.offerPrice} hint="Optional time-limited price.">
          <MoneyInput {...form.bind('offerPrice')} />
        </Field>
        {form.values.offerPrice && (
          <>
            <Field label="Offer starts"><Input type="datetime-local" {...form.bind('offerStartsAt')} /></Field>
            <Field label="Offer ends"><Input type="datetime-local" {...form.bind('offerEndsAt')} /></Field>
          </>
        )}
        <Field label="Description" className="full">
          <Textarea rows={2} {...form.bind('description')} />
        </Field>
        <div className="full stack-sm">
          <Checkbox {...form.bind('memberDiscountEligible', { type: 'checkbox' })} label="Apply member merchandise discount" />
          <Checkbox {...form.bind('availableToNonMembers', { type: 'checkbox' })} label="Non-members can buy" />
        </div>
        {!product && (
          <fieldset className="fieldset full">
            <legend>Sizes & opening stock</legend>
            <div className="stack-sm">
              {variants.map((v, i) => (
                <div key={i} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
                  <Field label={i === 0 ? 'Size' : undefined}>
                    <Select aria-label="Size" value={v.sizeLabel} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, sizeLabel: e.target.value } : x)))} options={SIZES.map((s) => ({ value: s, label: sizeLabel(s), disabled: s !== v.sizeLabel && used.includes(s) }))} />
                  </Field>
                  <Field label={i === 0 ? 'Stock' : undefined}>
                    <Input aria-label="Opening stock" type="number" min={0} inputMode="numeric" value={v.initialStock} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, initialStock: e.target.value } : x)))} />
                  </Field>
                  <Field label={i === 0 ? 'Alert at' : undefined}>
                    <Input aria-label="Low-stock threshold" type="number" min={0} inputMode="numeric" value={v.lowStockThreshold} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, lowStockThreshold: e.target.value } : x)))} />
                  </Field>
                  <IconButton icon={Trash} label={`Remove size ${v.sizeLabel}`} disabled={variants.length === 1} onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))} />
                </div>
              ))}
              {form.errors.variants && <span className="error-text">{form.errors.variants}</span>}
              <div>
                <Button size="sm" icon={Plus} disabled={used.length === SIZES.length} onClick={() => setVariants((vs) => [...vs, { sizeLabel: SIZES.find((s) => !used.includes(s)), initialStock: '0', lowStockThreshold: '5' }])}>
                  Add size
                </Button>
              </div>
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}

function StockDialog({ variant, onClose, clubId }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [getKey, renewKey] = useIdempotencyKey();
  const form = useForm({ type: 'RESTOCK', quantity: '', reason: '', threshold: '' });
  useEffect(() => {
    if (variant) {
      form.setValues({ type: 'RESTOCK', quantity: '', reason: '', threshold: String(variant.lowStockThreshold) });
      form.setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);
  const done = (msg) => {
    qc.invalidateQueries({ queryKey: ['inventory', clubId] });
    qc.invalidateQueries({ queryKey: ['products', clubId] });
    qc.invalidateQueries({ queryKey: ['low-stock', clubId] });
    toast.success(msg);
    onClose();
  };
  const adjust = useMutation({ mutationFn: (body) => merchApi.adjustStock(variant.id, body, getKey()), onSuccess: () => { renewKey(); done('Stock updated'); }, onError: (e) => { renewKey(); form.applyServerErrors(e); } });
  const threshold = useMutation({ mutationFn: (n) => merchApi.updateVariant(variant.id, { lowStockThreshold: n }), onSuccess: () => done('Alert threshold saved'), onError: (e) => form.applyServerErrors(e) });
  if (!variant) return null;
  const qty = parseInt(form.values.quantity, 10);
  const signed = form.values.type === 'RESTOCK' ? Math.abs(qty) : qty;
  return (
    <Modal open={!!variant} onClose={onClose} title={`${variant.productName} · ${sizeLabel(variant.sizeLabel)}`} description={`On hand ${variant.stockOnHand} · reserved ${variant.stockReserved} · available ${variant.available}`}>
      <div className="stack-lg">
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (form.validate({ quantity: (v) => (!/^-?\d+$/.test(v) || +v === 0 ? 'Enter a whole number other than 0.' : form.values.type === 'RESTOCK' && +v < 0 ? 'Restock must be positive.' : null), reason: required('A reason is required for the audit log.') }))
              adjust.mutate({ type: form.values.type, quantity: signed, reason: form.values.reason });
          }}
        >
          {adjust.isError && !Object.keys(adjust.error.details?.fields || {}).length && <Alert tone="danger">{errorMessage(adjust.error)}</Alert>}
          <div className="form-grid">
            <Field label="Type">
              <Select {...form.bind('type')} options={[{ value: 'RESTOCK', label: 'Restock (add units)' }, { value: 'ADJUSTMENT', label: 'Correction (+/−)' }]} />
            </Field>
            <Field label="Quantity" error={form.errors.quantity} hint={form.values.type === 'ADJUSTMENT' ? 'Use a negative number to remove units.' : undefined} required>
              <Input type="number" inputMode="numeric" {...form.bind('quantity')} />
            </Field>
            <Field label="Reason" error={form.errors.reason} required className="full">
              <Input placeholder="e.g. New batch from vendor / damaged in storage" {...form.bind('reason')} />
            </Field>
          </div>
          {Number.isInteger(signed) && signed !== 0 && <p className="subtle">On hand will become <strong className="num">{variant.stockOnHand + signed}</strong>.</p>}
          <div><Button type="submit" variant="primary" icon={ArrowsDownUp} loading={adjust.isPending}>Apply stock change</Button></div>
        </form>
        <hr className="divider" style={{ margin: 0 }} />
        <form className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); if (/^\d+$/.test(form.values.threshold)) threshold.mutate(+form.values.threshold); }}>
          <Field label="Low-stock alert threshold" error={form.errors.lowStockThreshold} hint="Club heads are emailed once when available stock falls to this level." className="grow">
            <Input type="number" min={0} inputMode="numeric" {...form.bind('threshold')} />
          </Field>
          <Button type="submit" loading={threshold.isPending} style={{ marginBottom: 22 }}>Save</Button>
        </form>
      </div>
    </Modal>
  );
}

export default function Merchandise() {
  const { clubId } = useParams();
  const { hasRole } = useAuth();
  const head = hasRole(clubId, 'CLUB_HEAD');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'products';
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(undefined);
  const [stockFor, setStockFor] = useState(null);
  const products = useQuery({ queryKey: ['products', clubId, 'all'], queryFn: () => merchApi.products(clubId, { all: true }) });
  const inventory = useQuery({ queryKey: ['inventory', clubId], queryFn: () => merchApi.inventory(clubId), enabled: tab === 'inventory' });
  const alerts = useQuery({ queryKey: ['low-stock', clubId, 'all'], queryFn: () => merchApi.lowStockAlerts(clubId) });
  const setStatus = useMutation({
    mutationFn: ({ id, status }) => merchApi.setStatus(id, status),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['products', clubId] });
      toast.success(`${p.name} is now ${p.status.toLowerCase()}`);
    },
    onError: (e) => toast.error(e),
  });
  const openAlerts = (alerts.data || []).filter((a) => a.status === 'OPEN').length;

  return (
    <>
      <PageHeader title="Merchandise" description="Catalogue, size-level inventory and low-stock alerts." actions={head && <Button variant="primary" icon={Plus} onClick={() => setEditing(null)}>New product</Button>} />
      <Tabs
        label="Merchandise sections"
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { value: 'products', label: 'Products', icon: TShirt },
          { value: 'inventory', label: 'Inventory', icon: Stack },
          { value: 'alerts', label: 'Low-stock alerts', icon: Bell, count: openAlerts || undefined },
        ]}
      />
      <TabPanel value={tab}>
        {tab === 'products' && (
          <Card flush>
            <QueryState query={products} empty={<EmptyState icon={Package} title="No products yet" action={head && <Button onClick={() => setEditing(null)}>Add a product</Button>} />}>
              {(rows) => (
                <DataTable
                  caption="Products"
                  rows={rows}
                  initialSort={{ key: 'name', dir: 'asc' }}
                  columns={[
                    { key: 'name', header: 'Product', sortable: true, render: (p) => <div><div className="cell-title">{p.name}</div><div className="cell-sub">{p.categoryName}{!p.availableToNonMembers && ' · members only'}</div></div> },
                    { key: 'pricePaise', header: 'Price', align: 'right', sortable: true, render: (p) => <div><Money paise={p.pricePaise} />{p.offerActive && <div className="cell-sub">Offer <Money paise={p.offerPricePaise} /></div>}</div> },
                    { key: 'sizes', header: 'Available by size', render: (p) => <div className="row" style={{ gap: 4 }}>{p.variants.map((v) => <Badge key={v.id} dot={false} tone={v.available <= v.lowStockThreshold ? (v.available === 0 ? 'danger' : 'warning') : 'neutral'}>{sizeLabel(v.sizeLabel)}: {v.available}</Badge>)}</div> },
                    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                    head && { key: 'act', header: <span className="sr-only">Actions</span>, align: 'right', render: (p) => (
                      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {(NEXT_STATUS[p.status] || []).map(([s, l]) => <Button key={s} size="sm" variant={s === 'ACTIVE' ? 'primary' : 'secondary'} loading={setStatus.isPending && setStatus.variables?.id === p.id} onClick={() => setStatus.mutate({ id: p.id, status: s })}>{l}</Button>)}
                        <IconButton icon={PencilSimple} label={`Edit ${p.name}`} onClick={() => setEditing(p)} />
                      </div>
                    ) },
                  ].filter(Boolean)}
                />
              )}
            </QueryState>
          </Card>
        )}
        {tab === 'inventory' && (
          <Card flush>
            <QueryState query={inventory} empty={<EmptyState icon={Stack} title="No inventory yet" />}>
              {(rows) => (
                <DataTable
                  caption="Inventory by size"
                  rows={rows}
                  initialSort={{ key: 'available', dir: 'asc' }}
                  columns={[
                    { key: 'productName', header: 'Product', sortable: true, render: (v) => <div><div className="cell-title">{v.productName}</div><div className="cell-sub">Size {sizeLabel(v.sizeLabel)}</div></div> },
                    { key: 'stockOnHand', header: 'On hand', align: 'right', sortable: true },
                    { key: 'stockReserved', header: 'Reserved', align: 'right', sortable: true, hideOnMobile: true },
                    { key: 'available', header: 'Available', align: 'right', sortable: true, render: (v) => <strong className="num" style={{ color: v.alertOpen ? 'var(--color-warning)' : undefined }}>{v.available}</strong> },
                    { key: 'lowStockThreshold', header: 'Alert at', align: 'right', hideOnMobile: true },
                    { key: 'alertOpen', header: 'Alert', render: (v) => (v.alertOpen ? <Badge tone={v.available === 0 ? 'danger' : 'warning'}>{v.available === 0 ? 'Out of stock' : 'Low'}</Badge> : <span className="subtle">–</span>) },
                    head && { key: 'act', header: <span className="sr-only">Actions</span>, align: 'right', render: (v) => <Button size="sm" icon={ArrowsDownUp} onClick={() => setStockFor(v)}>Adjust</Button> },
                  ].filter(Boolean)}
                />
              )}
            </QueryState>
          </Card>
        )}
        {tab === 'alerts' && (
          <Card flush>
            <QueryState query={alerts} empty={<EmptyState icon={Bell} title="No alerts">You'll be notified here and by email when a size runs low.</EmptyState>}>
              {(rows) => (
                <DataTable
                  caption="Low-stock alerts"
                  rows={rows}
                  columns={[
                    { key: 'productName', header: 'Product', render: (a) => <div><div className="cell-title">{a.productName}</div><div className="cell-sub">Size {sizeLabel(a.sizeLabel)}</div></div> },
                    { key: 'availableAtAlert', header: 'At alert', align: 'right' },
                    { key: 'availableNow', header: 'Now', align: 'right' },
                    { key: 'threshold', header: 'Threshold', align: 'right', hideOnMobile: true },
                    { key: 'createdAt', header: 'Raised', render: (a) => formatDateTime(a.createdAt) },
                    { key: 'status', header: 'Status', render: (a) => <Badge tone={a.status === 'OPEN' ? 'warning' : 'neutral'}>{a.status === 'OPEN' ? 'Open' : 'Resolved'}</Badge> },
                  ]}
                />
              )}
            </QueryState>
          </Card>
        )}
      </TabPanel>
      <ProductDialog open={editing !== undefined} onClose={() => setEditing(undefined)} clubId={clubId} product={editing} />
      <StockDialog variant={stockFor} onClose={() => setStockFor(null)} clubId={clubId} />
    </>
  );
}
