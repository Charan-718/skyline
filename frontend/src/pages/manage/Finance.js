import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Bank, ChartPie, CheckCircle, Coins, FileText, ListBullets, Plus, Receipt, Scales, ShieldCheck, Wallet, XCircle } from '@phosphor-icons/react';
import { financeApi, fundraisersApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { useClub, useIdempotencyKey } from '../../hooks';
import { Card, DescriptionList, PageHeader, StatCard, TabPanel, Tabs } from '../../components/layout';
import { Alert, Badge, CardsSkeleton, EmptyState, ProgressBar, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable';
import { Field, Input, MoneyInput, Select, Textarea, required, useForm } from '../../components/forms';
import { Modal } from '../../components/Modal';
import { BarSeries, Donut } from '../../components/charts';
import { Money } from '../../components/domain';
import { ExpenseForm } from '../../components/ExpenseForm';
import { useToast } from '../../components/Toast';
import { formatDate, formatDateTime, formatMonth, todayInput } from '../../utils/dates';
import { formatMoney, rupeesToPaise } from '../../utils/money';
import { LABELS, label } from '../../utils/status';
import { errorMessage } from '../../utils/errorMessages';

function Overview({ clubId, lead }) {
  const summary = useQuery({ queryKey: ['finance', 'summary', clubId], queryFn: () => financeApi.summary(clubId) });
  if (summary.isPending) return <CardsSkeleton count={4} />;
  return (
    <QueryState query={summary}>
      {(s) => (
        <div className="stack-lg">
          <div className="grid grid-4">
            <StatCard icon={Wallet} label="Available balance" value={<Money paise={s.availableBalancePaise} />} hint="All income received − all expenses paid" />
            <StatCard icon={Scales} tone="info" label="Projected after approved payouts" value={<Money paise={s.projectedBalancePaise} />} hint={`Available − ${formatMoney(s.approvedUnpaidTotalPaise)} approved, unpaid`} />
            <StatCard icon={ArrowDown} tone="success" label="Total income" value={<Money paise={s.totalIncomePaise} />} />
            <StatCard icon={ArrowUp} tone="accent" label="Expenses paid" value={<Money paise={s.totalPaidExpensesPaise} />} hint={`${formatMoney(s.pendingReviewTotalPaise)} awaiting review (not counted)`} />
          </div>
          <div className="grid grid-main-side">
            <Card title="Monthly cash flow" description="Settled ledger entries only. Pending payments and unpaid claims are excluded.">
              <BarSeries data={s.monthly} xKey="month" xFormat={formatMonth} format={(v, axis) => formatMoney(v, { compact: axis })} caption="Monthly income and expenses" series={[{ key: 'inPaise', label: 'Income' }, { key: 'outPaise', label: 'Expenses', colorIndex: 2 }]} />
            </Card>
            <div className="stack">
              <Card title="Budget">
                {s.activeBudget ? (
                  <div className="stack">
                    <div className="row-between"><strong>{s.activeBudget.name}</strong><Money paise={s.activeBudget.amountPaise} /></div>
                    <ProgressBar value={s.activeBudget.spentPaise} max={s.activeBudget.amountPaise} label="Spent" tone={s.activeBudget.spentPaise > s.activeBudget.amountPaise ? 'danger' : 'primary'} />
                    <DescriptionList items={[['Spent', <Money paise={s.activeBudget.spentPaise} />], ['Committed (approved)', <Money paise={s.activeBudget.committedPaise} />], ['Remaining', <Money paise={s.activeBudget.remainingPaise} />], ['After commitments', <Money paise={s.activeBudget.remainingAfterCommittedPaise} />]]} />
                  </div>
                ) : (
                  <EmptyState icon={Bank} title="No budget for this period">{lead ? 'The treasurer can set one in the Budgets tab.' : null}</EmptyState>
                )}
              </Card>
              <Card title="Income by source">
                <Donut data={Object.entries(s.incomeByCategory ?? {}).map(([k, v]) => ({ label: LABELS.ledgerCategory[k], value: v })).sort((a, b) => b.value - a.value).slice(0, 5)} format={(v) => formatMoney(v)} caption="Income by category" height={170} />
              </Card>
            </div>
          </div>
          {!lead && <Alert tone="info">You are seeing club-wide totals. Line-by-line transactions and receipts are visible to the treasurer and club head.</Alert>}
        </div>
      )}
    </QueryState>
  );
}

function Transactions({ clubId }) {
  const [direction, setDirection] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['transactions', clubId, direction, category, from, to, page], queryFn: () => financeApi.transactions(clubId, { direction, category, from, to, page, pageSize: 20 }), placeholderData: keepPreviousData });
  const reset = (fn) => (e) => { fn(e.target.value); setPage(1); };
  return (
    <Card flush>
      <Toolbar>
        <Select aria-label="Direction" value={direction} onChange={reset(setDirection)} placeholder="In & out" options={[{ value: 'IN', label: 'Income' }, { value: 'OUT', label: 'Expenses' }]} style={{ width: 'auto' }} />
        <Select aria-label="Category" value={category} onChange={reset(setCategory)} placeholder="All categories" options={Object.entries(LABELS.ledgerCategory).map(([value, l]) => ({ value, label: l }))} style={{ width: 'auto' }} />
        <label className="row subtle">From <Input type="date" value={from} onChange={reset(setFrom)} style={{ width: 'auto' }} aria-label="From date" /></label>
        <label className="row subtle">To <Input type="date" value={to} onChange={reset(setTo)} style={{ width: 'auto' }} aria-label="To date" /></label>
      </Toolbar>
      <QueryState query={q} isEmpty={(d) => !d.data.length} empty={<EmptyState icon={ListBullets} title="No transactions match" />}>
        {(d) => (
          <>
            <DataTable
              caption="Ledger transactions"
              rows={d.data}
              columns={[
                { key: 'occurredAt', header: 'Date', sortable: true, render: (t) => formatDateTime(t.occurredAt) },
                { key: 'description', header: 'Description', render: (t) => <div><div className="cell-title wrap-anywhere">{t.description}</div><div className="cell-sub">{LABELS.ledgerCategory[t.category]}{t.eventTitle ? ` · ${t.eventTitle}` : ''}{t.fundraiserName ? ` · ${t.fundraiserName}` : ''}</div></div> },
                { key: 'amountPaise', header: 'Amount', align: 'right', sortable: true, sortValue: (t) => (t.direction === 'IN' ? t.amountPaise : -t.amountPaise), render: (t) => <strong className="num" style={{ color: t.direction === 'IN' ? 'var(--color-success)' : 'var(--color-accent)' }}>{t.direction === 'IN' ? '+' : '−'}{formatMoney(t.amountPaise)}</strong> },
                { key: 'recordedByName', header: 'Recorded / approved', hideOnMobile: true, render: (t) => <span className="subtle">{t.recordedByName}{t.payerName ? ` (paid by ${t.payerName})` : ''}{t.approvedByName ? ` · approved by ${t.approvedByName}` : ''}</span> },
                { key: 'reference', header: 'Reference', hideOnMobile: true, render: (t) => <span className="mono subtle">{t.reference || '–'}</span> },
              ]}
            />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryState>
    </Card>
  );
}

function DecisionDialog({ expense, mode, onClose, clubId }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [getKey, renewKey] = useIdempotencyKey();
  const form = useForm({ note: '', payoutReference: '', paidOn: todayInput() });
  const act = useMutation({
    mutationFn: () => (mode === 'approve' ? financeApi.approve(expense.id, form.values.note, getKey()) : mode === 'reject' ? financeApi.reject(expense.id, form.values.note, getKey()) : financeApi.markPaid(expense.id, { payoutReference: form.values.payoutReference, paidOn: form.values.paidOn }, getKey())),
    onSuccess: () => {
      renewKey();
      ['expenses', 'finance', 'transactions', 'budgets'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(mode === 'approve' ? 'Claim approved' : mode === 'reject' ? 'Claim rejected' : 'Payout recorded', mode === 'pay' ? 'Posted to the ledger.' : undefined);
      onClose();
    },
    onError: (e) => { renewKey(); form.applyServerErrors(e); },
  });
  if (!expense) return null;
  const titles = { approve: 'Approve claim', reject: 'Reject claim', pay: 'Record payout' };
  const submit = (e) => {
    e.preventDefault();
    const rules = mode === 'reject' ? { note: required('Tell the submitter why.') } : mode === 'pay' ? { payoutReference: required('Enter the UPI / bank reference.'), paidOn: required('Required.') } : {};
    if (form.validate(rules)) act.mutate();
  };
  return (
    <Modal open={!!expense} onClose={onClose} title={titles[mode]} description={`${expense.title} · ${formatMoney(expense.amountPaise)} · ${expense.submittedByName}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={mode === 'reject' ? 'danger' : 'primary'} type="submit" form="decision-form" loading={act.isPending}>{titles[mode]}</Button></>}>
      <form id="decision-form" className="stack" onSubmit={submit} noValidate>
        {act.isError && !Object.keys(act.error.details?.fields || {}).length && <Alert tone="danger">{errorMessage(act.error)}</Alert>}
        <DescriptionList items={[['Kind', label('expenseKind', expense.kind)], ['Incurred', formatDate(expense.incurredOn)], ['Linked to', expense.eventTitle || expense.fundraiserName || '–'], ['Receipt', expense.receipt ? <span className="row" style={{ gap: 6 }}><FileText size={16} aria-hidden />{expense.receipt.originalName}</span> : '–'], expense.description && ['Notes', expense.description]]} />
        {mode === 'approve' && <Alert tone="info">Approving commits the amount (it reduces the projected balance) but no money moves until you record the payout.</Alert>}
        {mode !== 'pay' && (
          <Field label={mode === 'reject' ? 'Reason' : 'Note (optional)'} error={form.errors.note} required={mode === 'reject'}>
            <Textarea rows={2} {...form.bind('note')} />
          </Field>
        )}
        {mode === 'pay' && (
          <div className="form-grid">
            <Field label="Payout reference" error={form.errors.payoutReference} required><Input className="input mono" {...form.bind('payoutReference')} /></Field>
            <Field label="Paid on" error={form.errors.paidOn} required><Input type="date" max={todayInput()} {...form.bind('paidOn')} /></Field>
          </div>
        )}
      </form>
    </Modal>
  );
}

function Expenses({ clubId, isTreasurer, clubName }) {
  const [status, setStatus] = useState('SUBMITTED');
  const [page, setPage] = useState(1);
  const [decide, setDecide] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const q = useQuery({ queryKey: ['expenses', clubId, status, page], queryFn: () => financeApi.expenses(clubId, { status, page, pageSize: 15 }), placeholderData: keepPreviousData });
  return (
    <>
      <Card flush>
        <Toolbar>
          <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={['SUBMITTED', 'APPROVED', 'PAID', 'REJECTED'].map((s) => ({ value: s, label: label('x', s) }))} style={{ width: 'auto' }} />
          <span className="grow" />
          <Button icon={Plus} onClick={() => setNewOpen(true)}>{isTreasurer ? 'Claim or direct expense' : 'New claim'}</Button>
        </Toolbar>
        <QueryState query={q} isEmpty={(d) => !d.data.length} empty={<EmptyState icon={Receipt} title={status === 'SUBMITTED' ? 'No claims waiting' : 'Nothing here'}>{status === 'SUBMITTED' ? 'All reimbursement claims have been reviewed.' : null}</EmptyState>}>
          {(d) => (
            <>
              <DataTable
                caption="Expenses and reimbursement claims"
                rows={d.data}
                columns={[
                  { key: 'createdAt', header: 'Submitted', sortable: true, render: (e) => formatDate(e.createdAt) },
                  { key: 'title', header: 'Expense', render: (e) => <div><div className="cell-title wrap-anywhere">{e.title}</div><div className="cell-sub">{e.submittedByName} · {label('expenseKind', e.kind)}{e.eventTitle ? ` · ${e.eventTitle}` : ''}{e.fundraiserName ? ` · ${e.fundraiserName}` : ''}</div></div> },
                  { key: 'amountPaise', header: 'Amount', align: 'right', sortable: true, render: (e) => <Money paise={e.amountPaise} /> },
                  { key: 'receipt', header: 'Receipt', hideOnMobile: true, render: (e) => (e.receipt ? <span className="row subtle" style={{ gap: 4 }}><FileText size={14} aria-hidden /><span className="wrap-anywhere">{e.receipt.originalName}</span></span> : '–') },
                  { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
                  {
                    key: 'act', header: <span className="sr-only">Actions</span>, align: 'right', render: (e) => (
                      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {e.viewerCanDecide && <><Button size="sm" variant="ghost" icon={XCircle} onClick={() => setDecide({ e, mode: 'reject' })}>Reject</Button><Button size="sm" variant="primary" icon={CheckCircle} onClick={() => setDecide({ e, mode: 'approve' })}>Approve</Button></>}
                        {e.viewerCanPay && <Button size="sm" variant="primary" icon={Coins} onClick={() => setDecide({ e, mode: 'pay' })}>Mark paid</Button>}
                        {e.status === 'SUBMITTED' && !e.viewerCanDecide && <span className="subtle" title="Separation of duties">Needs another approver</span>}
                        {e.status === 'REJECTED' && e.decisionNote && <span className="subtle wrap-anywhere">“{e.decisionNote}”</span>}
                        {e.status === 'PAID' && <span className="mono subtle">{e.payoutReference}</span>}
                      </div>
                    ),
                  },
                ]}
              />
              <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <p className="subtle" style={{ marginTop: 'var(--space-3)' }}>
        <ShieldCheck size={14} aria-hidden style={{ display: 'inline', verticalAlign: '-2px' }} /> Nobody can approve or pay out their own claim. The treasurer's own claims are decided by the club head.
      </p>
      <DecisionDialog expense={decide?.e} mode={decide?.mode} onClose={() => setDecide(null)} clubId={clubId} />
      {newOpen && <ExpenseForm open={newOpen} onClose={() => setNewOpen(false)} clubs={[{ id: clubId, name: clubName }]} defaultClubId={clubId} allowDirect={isTreasurer} />}
    </>
  );
}

function Budgets({ clubId, isTreasurer }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['budgets', clubId], queryFn: () => financeApi.budgets(clubId) });
  const form = useForm({ name: '', periodStart: '', periodEnd: '', amount: '', notes: '' });
  const create = useMutation({
    mutationFn: (b) => financeApi.createBudget(clubId, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets', clubId] }); qc.invalidateQueries({ queryKey: ['finance'] }); toast.success('Budget created'); form.reset(); setOpen(false); },
    onError: (e) => { const f = e.details?.fields || {}; form.setErrors({ ...f, amount: f.amountPaise }); },
  });
  return (
    <>
      <QueryState query={q} empty={<div className="card"><EmptyState icon={Bank} title="No budgets yet" action={isTreasurer && <Button onClick={() => setOpen(true)}>Create budget</Button>} /></div>}>
        {(rows) => (
          <div className="stack">
            {isTreasurer && <div><Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>New budget</Button></div>}
            <div className="grid grid-2">
              {rows.map((b) => (
                <Card key={b.id} title={b.name} description={`${formatDate(b.periodStart)} – ${formatDate(b.periodEnd)}`} actions={b.isCurrent && <Badge tone="success">Current</Badge>}>
                  <div className="stack">
                    <ProgressBar value={b.spentPaise} max={b.amountPaise} label={`${formatMoney(b.spentPaise)} of ${formatMoney(b.amountPaise)} spent`} tone={b.remainingAfterCommittedPaise < 0 ? 'danger' : 'primary'} />
                    <DescriptionList items={[['Committed (approved, unpaid)', <Money paise={b.committedPaise} />], ['Remaining', <Money paise={b.remainingPaise} />], ['Remaining after commitments', <strong style={{ color: b.remainingAfterCommittedPaise < 0 ? 'var(--color-danger)' : undefined }}><Money paise={b.remainingAfterCommittedPaise} /></strong>], b.notes && ['Notes', b.notes]]} />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </QueryState>
      <Modal open={open} onClose={() => setOpen(false)} title="New budget" description="Budgets for one club cannot overlap." footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="budget-form" loading={create.isPending}>Create budget</Button></>}>
        <form id="budget-form" className="form-grid" noValidate onSubmit={(e) => {
          e.preventDefault();
          const v = form.values;
          if (!form.validate({ name: required('Enter a name.'), periodStart: required('Required.'), periodEnd: (x) => (!x ? 'Required.' : x < v.periodStart ? 'Must be after the start.' : null), amount: (x) => (!rupeesToPaise(x) ? 'Enter an amount above zero.' : null) })) return;
          create.mutate({ name: v.name, periodStart: v.periodStart, periodEnd: v.periodEnd, amountPaise: rupeesToPaise(v.amount), notes: v.notes || null });
        }}>
          {create.isError && !Object.keys(create.error.details?.fields || {}).length && <div className="full"><Alert tone="danger">{errorMessage(create.error)}</Alert></div>}
          <Field label="Name" error={form.errors.name} required className="full"><Input placeholder="e.g. Even semester 2027" {...form.bind('name')} /></Field>
          <Field label="Starts" error={form.errors.periodStart} required><Input type="date" {...form.bind('periodStart')} /></Field>
          <Field label="Ends" error={form.errors.periodEnd} required><Input type="date" {...form.bind('periodEnd')} /></Field>
          <Field label="Amount" error={form.errors.amount} required className="full"><MoneyInput {...form.bind('amount')} /></Field>
          <Field label="Notes" className="full"><Textarea rows={2} {...form.bind('notes')} /></Field>
        </form>
      </Modal>
    </>
  );
}

function Income({ clubId }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [getKey, renewKey] = useIdempotencyKey();
  const funds = useQuery({ queryKey: ['fundraisers', clubId], queryFn: () => fundraisersApi.list(clubId) });
  const form = useForm({ fundraiserId: '', amount: '', receivedOn: todayInput(), description: '', reference: '' });
  const save = useMutation({
    mutationFn: (b) => financeApi.recordIncome(clubId, b, getKey()),
    onSuccess: () => { renewKey(); ['finance', 'transactions', 'fundraisers', 'fundraiser'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast.success('Income recorded', 'Posted to the ledger.'); form.reset(); },
    onError: (e) => { renewKey(); const f = e.details?.fields || {}; form.setErrors({ ...f, amount: f.amountPaise }); },
  });
  return (
    <Card title="Record fundraiser income" description="Cash or transfers received outside the platform. Ticket, merch and dues income is recorded automatically." style={{ maxWidth: 640 }}>
      <form className="form-grid" noValidate onSubmit={(e) => {
        e.preventDefault();
        const v = form.values;
        if (!form.validate({ fundraiserId: required('Choose a fundraiser.'), amount: (x) => (!rupeesToPaise(x) ? 'Enter an amount above zero.' : null), receivedOn: required('Required.'), description: required('Describe the income.') })) return;
        save.mutate({ fundraiserId: v.fundraiserId, amountPaise: rupeesToPaise(v.amount), receivedOn: v.receivedOn, description: v.description, reference: v.reference || undefined });
      }}>
        {save.isError && !Object.keys(save.error.details?.fields || {}).length && <div className="full"><Alert tone="danger">{errorMessage(save.error)}</Alert></div>}
        <Field label="Fundraiser" error={form.errors.fundraiserId} required className="full">
          <Select {...form.bind('fundraiserId')} placeholder="Choose…" options={(funds.data || []).map((f) => ({ value: f.id, label: `${f.name}${f.status !== 'ACTIVE' ? ` (${f.status.toLowerCase()})` : ''}` }))} />
        </Field>
        <Field label="Amount" error={form.errors.amount} required><MoneyInput {...form.bind('amount')} /></Field>
        <Field label="Received on" error={form.errors.receivedOn} required><Input type="date" max={todayInput()} {...form.bind('receivedOn')} /></Field>
        <Field label="Description" error={form.errors.description} required className="full"><Input placeholder="e.g. Donation box, library block" {...form.bind('description')} /></Field>
        <Field label="Receipt / reference no." className="full"><Input className="input mono" {...form.bind('reference')} /></Field>
        <div className="full"><Button type="submit" variant="primary" icon={ArrowDown} loading={save.isPending}>Record income</Button></div>
      </form>
    </Card>
  );
}

function Reconciliation({ clubId }) {
  const q = useQuery({ queryKey: ['finance', 'reconciliation', clubId], queryFn: () => financeApi.reconciliation(clubId) });
  return (
    <QueryState query={q}>
      {(r) => (
        <div className="stack">
          <Alert tone={r.ok ? 'success' : 'danger'} title={r.ok ? 'Books reconcile' : 'Mismatches found'}>Checked {formatDateTime(r.checkedAt)}. Every succeeded payment and paid expense must have exactly one ledger entry.</Alert>
          <Card flush>
            <DataTable
              caption="Reconciliation checks"
              rowKey="name"
              rows={r.checks}
              columns={[
                { key: 'name', header: 'Check' },
                { key: 'expected', header: 'Expected', align: 'right', render: (c) => (c.expectedPaise != null ? <Money paise={c.expectedPaise} /> : c.expected) },
                { key: 'actual', header: 'Ledger', align: 'right', render: (c) => (c.actualPaise != null ? <Money paise={c.actualPaise} /> : c.actual) },
                { key: 'ok', header: 'Result', render: (c) => <Badge tone={c.ok ? 'success' : 'danger'}>{c.ok ? 'OK' : 'Mismatch'}</Badge> },
              ]}
            />
          </Card>
        </div>
      )}
    </QueryState>
  );
}

export default function Finance() {
  const { clubId } = useParams();
  const { hasRole } = useAuth();
  const club = useClub(clubId);
  const [params, setParams] = useSearchParams();
  const lead = hasRole(clubId, 'CLUB_HEAD', 'TREASURER');
  const isTreasurer = hasRole(clubId, 'TREASURER');
  const tabs = [
    { value: 'overview', label: 'Overview', icon: ChartPie },
    lead && { value: 'transactions', label: 'Transactions', icon: ListBullets },
    lead && { value: 'expenses', label: 'Expenses & claims', icon: Receipt },
    lead && { value: 'budgets', label: 'Budgets', icon: Bank },
    isTreasurer && { value: 'income', label: 'Record income', icon: ArrowDown },
    lead && { value: 'reconciliation', label: 'Reconciliation', icon: ShieldCheck },
  ].filter(Boolean);
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview';
  return (
    <>
      <PageHeader title="Finance" description="Every rupee in and out: dues, tickets, merch, fundraisers and reimbursements." />
      <Tabs label="Finance sections" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={tabs} />
      <TabPanel value={tab}>
        {tab === 'overview' && <Overview clubId={clubId} lead={lead} />}
        {tab === 'transactions' && <Transactions clubId={clubId} />}
        {tab === 'expenses' && <Expenses clubId={clubId} isTreasurer={isTreasurer} clubName={club.data?.name || ''} />}
        {tab === 'budgets' && <Budgets clubId={clubId} isTreasurer={isTreasurer} />}
        {tab === 'income' && <Income clubId={clubId} />}
        {tab === 'reconciliation' && <Reconciliation clubId={clubId} />}
      </TabPanel>
    </>
  );
}
