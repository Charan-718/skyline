import { useDebounced } from '../../hooks';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowSquareOut, ChartBar, CheckCircle, Info, ListChecks, LockKey, PencilSimple, Prohibit, QrCode, RocketLaunch, Users, X } from '@phosphor-icons/react';
import { clubsApi, eventsApi, membershipsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Card, DescriptionList, PageHeader, StatCard, TabPanel, Tabs } from '../../components/layout';
import { Alert, Badge, CardsSkeleton, EmptyState, ErrorState, ProgressBar, QueryState, StatusBadge, PageLoader } from '../../components/feedback';
import { Button, IconButton } from '../../components/Button';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable';
import { Field, Input, Select, Textarea } from '../../components/forms';
import { ConfirmDialog } from '../../components/Modal';
import { AreaSeries, BarSeries } from '../../components/charts';
import { Money } from '../../components/domain';
import { useToast } from '../../components/Toast';
import { formatDate, formatDateTime, formatTime } from '../../utils/dates';
import { formatMoney, formatPercent } from '../../utils/money';
import { label, LABELS } from '../../utils/status';
import { EventForm } from './EventForm';
import { AgentChat, useAgentAvailable, useAgentConversation } from './EventAgent';

function Overview({ event }) {
  const report = useQuery({ queryKey: ['event-report', event.id], queryFn: () => eventsApi.report(event.id) });
  if (report.isPending) return <CardsSkeleton count={4} />;
  if (report.isError) return <div className="card"><ErrorState error={report.error} onRetry={() => report.refetch()} /></div>;
  const raw = report.data;
  const r = {
    ...raw,
    memberVsNonMember: raw.memberVsNonMember ?? { MEMBER: 0, NON_MEMBER: 0 },
    revenueSeries: raw.revenueSeries ?? [],
    checkInSeries: raw.checkInSeries ?? [],
    paymentStatusBreakdown: raw.paymentStatusBreakdown ?? [],
    pendingBookings: raw.pendingBookings ?? 0,
    remainingCapacity: raw.remainingCapacity ?? 0,
    expensesPaidPaise: raw.expensesPaidPaise ?? 0,
    expensesApprovedUnpaidPaise: raw.expensesApprovedUnpaidPaise ?? 0,
    eventNetPaise: raw.eventNetPaise ?? 0,
    grossRecordedRevenuePaise: raw.grossRecordedRevenuePaise ?? 0,
    earlyBirdSold: raw.earlyBirdSold ?? 0,
  };
  return (
    <div className="stack-lg">
      <div className="grid grid-4">
        <StatCard label="Tickets sold" value={`${r.ticketsSold} / ${r.capacity}`} hint={`${r.pendingBookings} awaiting payment · ${r.remainingCapacity} seats free`} icon={Users} />
        <StatCard label="Checked in" value={r.checkedIn} tone="success" hint={r.attendanceRate == null ? 'No tickets sold yet' : `${formatPercent(r.attendanceRate)} attendance`} icon={CheckCircle} />
        <StatCard label="Ticket revenue" value={<Money paise={r.grossRecordedRevenuePaise} />} tone="info" hint="Settled payments only · no refunds" />
        <StatCard label="Event net" value={<Money paise={r.eventNetPaise} />} tone={r.eventNetPaise >= 0 ? 'success' : 'danger'} hint={`${formatMoney(r.expensesPaidPaise)} paid · ${formatMoney(r.expensesApprovedUnpaidPaise)} approved unpaid`} />
      </div>
      <div className="grid grid-2">
        <Card title="Ticket revenue by day">
          <AreaSeries data={r.revenueSeries} xKey="date" xFormat={(d) => formatDate(d).replace(/ \d{4}$/, '')} format={(v, axis) => formatMoney(v, { compact: axis })} series={[{ key: 'amountPaise', label: 'Revenue' }]} caption="Daily ticket revenue" />
        </Card>
        <Card title="Check-ins over time" description="15-minute intervals">
          <BarSeries data={r.checkInSeries} xKey="at" xFormat={formatTime} series={[{ key: 'count', label: 'Check-ins', colorIndex: 1 }]} caption="Check-ins per 15 minutes" />
        </Card>
      </div>
      <div className="grid grid-2">
        <Card title="Who bought tickets">
          <DescriptionList items={[['Members', r.memberVsNonMember.MEMBER], ['Non-members', r.memberVsNonMember.NON_MEMBER], ['Early-bird tickets', r.earlyBirdSold]]} />
        </Card>
        <Card title="Payments" description="Only succeeded payments count as revenue.">
          {r.paymentStatusBreakdown.length ? (
            <DescriptionList items={r.paymentStatusBreakdown.map((p) => [<StatusBadge status={p.status} />, <>{p.count} · <Money paise={p.amountPaise} /></>])} />
          ) : (
            <p className="muted">No payments yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Bookings({ eventId }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [buyerType, setBuyerType] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useQuery({ queryKey: ['bookings', eventId, dq, status, buyerType, page], queryFn: () => eventsApi.bookings(eventId, { q: dq, status, buyerType, page, pageSize: 15 }), placeholderData: keepPreviousData });
  return (
    <Card flush>
      <Toolbar>
        <Input type="search" aria-label="Search bookings" placeholder="Search name, email or ticket code" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="input grow" />
        <Select aria-label="Booking status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="Any status" options={['CONFIRMED', 'PENDING_PAYMENT', 'CANCELLED', 'EXPIRED'].map((s) => ({ value: s, label: label('x', s) }))} style={{ width: 'auto' }} />
        <Select aria-label="Buyer type" value={buyerType} onChange={(e) => { setBuyerType(e.target.value); setPage(1); }} placeholder="Members & non-members" options={Object.entries(LABELS.buyerType).map(([value, l]) => ({ value, label: l }))} style={{ width: 'auto' }} />
      </Toolbar>
      <QueryState query={list} isEmpty={(d) => !d.data.length} empty={<EmptyState icon={ListChecks} title="No bookings match" />}>
        {(d) => (
          <>
            <DataTable
              caption="Event bookings"
              rows={d.data}
              columns={[
                { key: 'holderName', header: 'Attendee', sortable: true, render: (b) => <div><div className="cell-title">{b.holderName}</div><div className="cell-sub wrap-anywhere">{b.holderEmail}</div></div> },
                { key: 'priceTier', header: 'Tier', render: (b) => <span className="subtle">{label('priceTier', b.priceTier)}</span>, hideOnMobile: true },
                { key: 'finalPricePaise', header: 'Paid', align: 'right', sortable: true, render: (b) => (b.finalPricePaise ? <Money paise={b.finalPricePaise} /> : 'Free') },
                { key: 'status', header: 'Booking', render: (b) => <StatusBadge status={b.status} /> },
                { key: 'ticketStatus', header: 'Ticket', render: (b) => (b.ticketStatus ? <StatusBadge status={b.ticketStatus} /> : '–') },
                { key: 'ticketCode', header: 'Code', render: (b) => <span className="mono">{b.ticketCode || '–'}</span>, hideOnMobile: true },
              ]}
            />
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryState>
    </Card>
  );
}

function Team({ event, isHead }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [orgPick, setOrgPick] = useState('');
  const [staffPick, setStaffPick] = useState('');
  const organizers = useQuery({ queryKey: ['organizers', event.id], queryFn: () => eventsApi.organizers(event.id) });
  const staff = useQuery({ queryKey: ['staff', event.id], queryFn: () => eventsApi.staff(event.id) });
  const roles = useQuery({ queryKey: ['roles', event.clubId], queryFn: () => clubsApi.roles(event.clubId), enabled: isHead });
  const members = useQuery({ queryKey: ['members', event.clubId, 'picker'], queryFn: () => membershipsApi.clubMembers(event.clubId, { status: 'ACTIVE', pageSize: 100 }), enabled: isHead });

  const refresh = () => ['organizers', 'staff', 'event'].forEach((k) => qc.invalidateQueries({ queryKey: [k, event.id] }));
  const setOrgs = useMutation({ mutationFn: (ids) => eventsApi.setOrganizers(event.id, ids), onSuccess: () => { refresh(); setOrgPick(''); toast.success('Organizers updated'); }, onError: (e) => toast.error(e) });
  const addStaff = useMutation({ mutationFn: (id) => eventsApi.addStaff(event.id, id), onSuccess: () => { refresh(); setStaffPick(''); toast.success('Staff added', 'They can now scan tickets for this event.'); }, onError: (e) => toast.error(e) });
  const removeStaff = useMutation({ mutationFn: (id) => eventsApi.removeStaff(event.id, id), onSuccess: () => { refresh(); toast.success('Staff removed'); }, onError: (e) => toast.error(e) });

  const orgIds = (organizers.data || []).map((o) => o.userId);
  const people = new Map();
  (roles.data || []).forEach((r) => people.set(r.userId, r.fullName));
  (members.data?.data || []).forEach((m) => people.set(m.userId, m.fullName));
  const orgOptions = [...people].filter(([id]) => !orgIds.includes(id)).map(([value, l]) => ({ value, label: l })).sort((a, b) => a.label.localeCompare(b.label));
  const staffIds = (staff.data?.staff || []).map((s) => s.userId);
  const staffOptions = (staff.data?.candidates || []).filter((c) => !staffIds.includes(c.userId)).map((c) => ({ value: c.userId, label: c.fullName }));
  const editable = ['DRAFT', 'PUBLISHED'].includes(event.status);

  return (
    <div className="grid grid-2">
      <Card title="Organizers" description="Run the event: edit details, assign staff, view bookings and reports.">
        <QueryState query={organizers} empty={<Alert tone="warning">No organizer yet. At least one is required before publishing.</Alert>}>
          {(list) => (
            <ul className="list">
              {list.map((o) => (
                <li key={o.userId} className="row-between" style={{ paddingInline: 0 }}>
                  <span><span className="cell-title">{o.fullName}</span> <span className="cell-sub">{o.email}</span></span>
                  {isHead && editable && !(event.status === 'PUBLISHED' && list.length === 1) && <IconButton icon={X} label={`Remove ${o.fullName}`} onClick={() => setOrgs.mutate(orgIds.filter((id) => id !== o.userId))} />}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
        {isHead && editable && (
          <form className="row" style={{ marginTop: 'var(--space-4)', flexWrap: 'nowrap', alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); if (orgPick) setOrgs.mutate([...orgIds, orgPick]); }}>
            <Field label="Add organizer" className="grow">
              <Select value={orgPick} onChange={(e) => setOrgPick(e.target.value)} placeholder="Choose a person" options={orgOptions} />
            </Field>
            <Button type="submit" disabled={!orgPick} loading={setOrgs.isPending}>Add</Button>
          </form>
        )}
      </Card>
      <Card title="Door staff" description="Club volunteers who can scan tickets for this event only.">
        <QueryState query={staff} isEmpty={(d) => !d.staff.length} empty={<EmptyState icon={QrCode} title="No staff assigned" />}>
          {(d) => (
            <ul className="list">
              {d.staff.map((s) => (
                <li key={s.userId} className="row-between" style={{ paddingInline: 0 }}>
                  <span><span className="cell-title">{s.fullName}</span> <span className="cell-sub">· {s.scans} scans</span></span>
                  {editable && <IconButton icon={X} label={`Remove ${s.fullName}`} onClick={() => removeStaff.mutate(s.userId)} />}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
        {editable && (
          <form className="row" style={{ marginTop: 'var(--space-4)', flexWrap: 'nowrap', alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); if (staffPick) addStaff.mutate(staffPick); }}>
            <Field label="Add volunteer" className="grow">
              <Select value={staffPick} onChange={(e) => setStaffPick(e.target.value)} placeholder={staffOptions.length ? 'Choose a volunteer' : 'No more volunteers'} options={staffOptions} />
            </Field>
            <Button type="submit" disabled={!staffPick} loading={addStaff.isPending}>Add</Button>
          </form>
        )}
      </Card>
    </div>
  );
}

const EDIT_EXAMPLES = ['Make it members only', 'Start an hour later', 'Raise the non-member price by ₹20'];

/** Edit by prompt: the agent proposes a patch; nothing changes until Apply (PATCH /events/:id). */
function AgentEdit({ event, isHead, onDone }) {
  const toast = useToast();
  const convo = useAgentConversation((body) => eventsApi.agentEditTurn(event.id, body), 'edit');
  const last = convo.last;
  const ready = last?.status === 'READY';
  const wantsPublish = ready && last.publishRequested && event.status === 'DRAFT';
  const apply = useMutation({
    mutationFn: async () => {
      if (Object.keys(convo.value).length) await eventsApi.update(event.id, convo.value);
      if (wantsPublish) await eventsApi.publish(event.id);
    },
    onSuccess: () => {
      toast.success(wantsPublish ? 'Event updated and published' : 'Event updated');
      convo.reset();
      onDone();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card title="Edit with the AI agent" description={isHead ? 'Say what to change, e.g. a new price or time. You see every change before it is applied.' : 'As an organizer you can change the description and venue.'}>
      <div className="stack">
        <AgentChat convo={convo} examples={isHead ? EDIT_EXAMPLES : ['Move it to Hall 3']} placeholder="What should change?" />
        {ready && (
          <div className="stack-sm agent-commit">
            {last.changes.length > 0 && (
              <table className="agent-changes">
                <thead>
                  <tr><th scope="col">Field</th><th scope="col">Now</th><th scope="col">After</th></tr>
                </thead>
                <tbody>
                  {last.changes.map((c) => (
                    <tr key={c.field}><th scope="row">{c.label}</th><td>{c.before}</td><td><strong>{c.after}</strong></td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {wantsPublish && last.needsOrganizer && <Alert tone="warning">Assign an organizer in the Team tab before publishing.</Alert>}
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <Button onClick={() => convo.reset()}>Discard</Button>
              <Button variant="primary" loading={apply.isPending} disabled={wantsPublish && last.needsOrganizer} onClick={() => apply.mutate()}>
                {wantsPublish ? (last.changes.length ? 'Apply and publish' : 'Publish') : 'Apply changes'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function EventManage() {
  const { eventId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const setTab = (t) => setParams({ tab: t }, { replace: true });
  const { hasRole } = useAuth();
  const agentAvailable = useAgentAvailable();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState('');
  const event = useQuery({ queryKey: ['event', eventId], queryFn: () => eventsApi.get(eventId) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['event', eventId] });
    qc.invalidateQueries({ queryKey: ['events'] });
    qc.invalidateQueries({ queryKey: ['event-report', eventId] });
  };
  const update = useMutation({ mutationFn: (body) => eventsApi.update(eventId, body), onSuccess: () => { invalidate(); toast.success('Event saved'); setTab('overview'); } });
  const action = useMutation({
    mutationFn: ({ kind }) => (kind === 'publish' ? eventsApi.publish(eventId) : kind === 'cancel' ? eventsApi.cancel(eventId, reason) : eventsApi.complete(eventId)),
    onSuccess: (r, { kind }) => {
      invalidate();
      setConfirm(null);
      setReason('');
      if (kind === 'publish') toast.success('Event published', 'Bookings open according to the registration window.');
      if (kind === 'cancel') toast.warning('Event cancelled', `${r.cancelledTickets} tickets and ${r.cancelledBookings} bookings cancelled. Settle refunds offline.`);
      if (kind === 'complete') toast.success('Event marked completed');
    },
    onError: (e) => {
      setConfirm(null);
      toast.error(e);
      if (e.code === 'ORGANIZER_REQUIRED') setTab('team');
    },
  });

  if (event.isPending) return <PageLoader />;
  if (event.isError) return <div className="card"><ErrorState error={event.error} onRetry={() => event.refetch()} /></div>;
  const e = event.data;
  const isHead = hasRole(e.clubId, 'CLUB_HEAD');
  const isTreasurer = hasRole(e.clubId, 'TREASURER');
  if (!e.viewerCanManage && !isTreasurer) {
    return (
      <div className="card">
        <h1 className="sr-only" tabIndex={-1} data-page-title>{e.title}</h1>
        <EmptyState icon={LockKey} title="You don't manage this event" action={<Button to={`/events/${e.id}`}>View public page</Button>}>
          Event management is available to the club head and the event's organizers{e.clubName ? ` of ${e.clubName}` : ''}.
        </EmptyState>
      </div>
    );
  }
  const editable = ['DRAFT', 'PUBLISHED'].includes(e.status) && e.viewerCanManage;
  const ended = new Date(e.endsAt) <= new Date();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Events', to: isHead ? `/manage/${e.clubId}/events` : '/me/duties' }, { label: e.title }]}
        title={e.title}
        badge={<StatusBadge status={e.status} />}
        description={`${e.venue} · ${formatDateTime(e.startsAt)}`}
        actions={
          <>
            <Button icon={ArrowSquareOut} to={`/events/${e.id}`}>Public page</Button>
            {e.status === 'PUBLISHED' && <Button icon={QrCode} to={`/scan/${e.id}`}>Scanner</Button>}
            {isHead && e.status === 'DRAFT' && <Button variant="primary" icon={RocketLaunch} onClick={() => setConfirm('publish')}>Publish</Button>}
            {e.status === 'PUBLISHED' && ended && e.viewerCanManage && <Button variant="primary" icon={CheckCircle} onClick={() => setConfirm('complete')}>Mark completed</Button>}
            {isHead && editable && <Button variant="danger" icon={Prohibit} onClick={() => setConfirm('cancel')}>Cancel event</Button>}
          </>
        }
      />
      {e.status === 'DRAFT' && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert tone="info" title="Draft, not visible to students">{e.organizers.length ? 'Ready to publish when you are.' : 'Assign at least one organizer in the Team tab, then publish.'}</Alert>
        </div>
      )}
      {e.status === 'CANCELLED' && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert tone="danger" title="Cancelled">{e.cancelReason}</Alert>
        </div>
      )}
      <Card>
        <ProgressBar value={e.seatsReserved} max={e.capacity} label={`${e.ticketsSold} sold · ${e.seatsReserved - e.ticketsSold} held · ${e.remainingSeats} free of ${e.capacity}`} />
      </Card>
      <div style={{ marginTop: 'var(--space-5)' }}>
        <Tabs
          label="Event management"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'overview', label: 'Report', icon: ChartBar },
            { value: 'bookings', label: 'Bookings', icon: ListChecks },
            { value: 'team', label: 'Team', icon: Users },
            editable && { value: 'edit', label: 'Edit details', icon: PencilSimple },
          ].filter(Boolean)}
        />
        <TabPanel value={tab}>
          {tab === 'overview' && <Overview event={e} />}
          {tab === 'bookings' && <Bookings eventId={e.id} />}
          {tab === 'team' && <Team event={e} isHead={isHead} />}
          {tab === 'edit' && editable && agentAvailable && (
            <div style={{ maxWidth: 880, marginBottom: 'var(--space-4)' }}>
              <AgentEdit event={e} isHead={isHead} onDone={invalidate} />
            </div>
          )}
          {tab === 'edit' && editable && (
            <div className="card card-body stack" style={{ maxWidth: 880 }}>
              {e.status === 'PUBLISHED' && isHead && <Alert tone="info">Price changes affect new bookings only. Capacity cannot go below {e.seatsReserved} seats already sold or held.</Alert>}
              <EventForm key={`${e.id}-${e.status}-${e.updatedAt}`} event={e} restrictTo={isHead ? null : ['description', 'venue']} onSubmit={(b) => update.mutate(b)} submitting={update.isPending} error={update.error} />
              <div className="actions" style={{ justifyContent: 'flex-end' }}>
                <Button onClick={() => setTab('overview')}>Discard</Button>
                <Button variant="primary" type="submit" form="event-form" loading={update.isPending}>Save changes</Button>
              </div>
            </div>
          )}
        </TabPanel>
      </div>
      <ConfirmDialog open={confirm === 'publish'} onClose={() => setConfirm(null)} onConfirm={() => action.mutate({ kind: 'publish' })} loading={action.isPending} title="Publish this event?" confirmLabel="Publish">
        Students will see the event and can book once registration opens ({formatDateTime(e.earlyAccessOpensAt || e.registrationOpensAt)}).
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'complete'} onClose={() => setConfirm(null)} onConfirm={() => action.mutate({ kind: 'complete' })} loading={action.isPending} title="Mark as completed?" confirmLabel="Mark completed">
        Check-in closes and the event moves to the completed list. The report stays available.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'cancel'}
        onClose={() => setConfirm(null)}
        onConfirm={() => action.mutate({ kind: 'cancel' })}
        loading={action.isPending}
        tone="danger"
        title="Cancel this event?"
        confirmLabel="Cancel event"
        extra={
          <Field label="Reason (shown to attendees)" required>
            <Textarea rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} />
          </Field>
        }
      >
        All <strong>{e.ticketsSold}</strong> tickets will be cancelled and held seats released. Refunds are not automated. Settle them offline and publish an announcement.
        <span className="row" style={{ gap: 6, marginTop: 8 }}><Info size={16} aria-hidden /><Badge tone="danger" dot={false}>This cannot be undone</Badge></span>
      </ConfirmDialog>
    </>
  );
}
