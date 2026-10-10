import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarBlank, Coins, IdentificationBadge, TShirt } from '@phosphor-icons/react';
import { reportsApi } from '../../api/endpoints';
import { Card, DescriptionList, PageHeader, StatCard, TabPanel, Tabs } from '../../components/layout';
import { CardsSkeleton, EmptyState, QueryState, StatusBadge } from '../../components/feedback';
import { DataTable } from '../../components/DataTable';
import { BarSeries, Donut } from '../../components/charts';
import { Money } from '../../components/domain';
import { formatDate, formatMonth } from '../../utils/dates';
import { formatMoney, formatPercent } from '../../utils/money';
import { LABELS, sizeLabel } from '../../utils/status';

function EventsReport({ clubId }) {
  const q = useQuery({ queryKey: ['reports', 'events', clubId], queryFn: () => reportsApi.events(clubId) });
  return (
    <QueryState query={q} loading={<CardsSkeleton />} empty={<div className="card"><EmptyState icon={CalendarBlank} title="No events to report on" /></div>}>
      {(rows) => {
        const sorted = [...rows].sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1));
        const totals = rows.reduce((t, r) => ({ sold: t.sold + r.ticketsSold, checked: t.checked + r.checkedIn, rev: t.rev + r.grossRecordedRevenuePaise, net: t.net + r.eventNetPaise }), { sold: 0, checked: 0, rev: 0, net: 0 });
        return (
          <div className="stack-lg">
            <div className="grid grid-4">
              <StatCard label="Tickets sold" value={totals.sold} />
              <StatCard label="Checked in" value={totals.checked} tone="success" hint={totals.sold ? `${formatPercent(totals.checked / totals.sold)} attendance` : undefined} />
              <StatCard label="Ticket revenue" value={<Money paise={totals.rev} />} tone="info" />
              <StatCard label="Net after event costs" value={<Money paise={totals.net} />} tone={totals.net >= 0 ? 'success' : 'danger'} />
            </div>
            <Card title="Revenue vs event costs">
              <BarSeries data={sorted.slice(0, 8).reverse().map((r) => ({ title: r.title.length > 18 ? `${r.title.slice(0, 17)}…` : r.title, rev: r.grossRecordedRevenuePaise, cost: r.expensesPaidPaise }))} xKey="title" format={(v, axis) => formatMoney(v, { compact: axis })} caption="Revenue and paid expenses per event" series={[{ key: 'rev', label: 'Ticket revenue' }, { key: 'cost', label: 'Expenses paid', colorIndex: 2 }]} />
            </Card>
            <Card flush title="Per event">
              <DataTable
                caption="Event report"
                rows={sorted}
                rowKey="eventId"
                columns={[
                  { key: 'title', header: 'Event', sortable: true, render: (r) => <div><Link to={`/manage/events/${r.eventId}`} className="cell-title">{r.title}</Link><div className="cell-sub">{formatDate(r.startsAt)}</div></div> },
                  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                  { key: 'ticketsSold', header: 'Sold', align: 'right', sortable: true, render: (r) => `${r.ticketsSold}/${r.capacity}` },
                  { key: 'members', header: 'Member / non', align: 'right', hideOnMobile: true, render: (r) => `${r.memberVsNonMember.MEMBER} / ${r.memberVsNonMember.NON_MEMBER}` },
                  { key: 'attendanceRate', header: 'Attendance', align: 'right', sortable: true, render: (r) => formatPercent(r.attendanceRate) },
                  { key: 'grossRecordedRevenuePaise', header: 'Revenue', align: 'right', sortable: true, render: (r) => <Money paise={r.grossRecordedRevenuePaise} /> },
                  { key: 'eventNetPaise', header: 'Net', align: 'right', sortable: true, render: (r) => <Money paise={r.eventNetPaise} /> },
                ]}
              />
            </Card>
          </div>
        );
      }}
    </QueryState>
  );
}

function MembershipReport({ clubId }) {
  const q = useQuery({ queryKey: ['reports', 'memberships', clubId], queryFn: () => reportsApi.memberships(clubId) });
  return (
    <QueryState query={q} loading={<CardsSkeleton />}>
      {(r) => (
        <div className="stack-lg">
          <div className="grid grid-4">
            <StatCard label="Active members" value={r.activeMembers} tone="success" />
            <StatCard label="Expiring in 7 days" value={r.expiringIn7Days} tone="warning" />
            <StatCard label="Dues collected" value={<Money paise={r.duesCollectedPaise} />} tone="info" />
            <StatCard label="On AutoPay" value={r.autopayEnabled} />
          </div>
          <div className="grid grid-main-side">
            <Card title="Joins and renewals by month">
              <BarSeries data={r.monthly} xKey="month" xFormat={formatMonth} caption="Joins and renewals per month" series={[{ key: 'joins', label: 'New members' }, { key: 'renewals', label: 'Renewals', colorIndex: 1 }]} stacked />
            </Card>
            <Card title="Active members by plan">
              <Donut data={r.byPlan.map((p) => ({ label: p.planName, value: p.activeMembers }))} caption="Active members by plan" />
            </Card>
          </div>
          <Card title="Status breakdown">
            <DescriptionList items={[['Total records', r.totalMembers], ['Active', r.activeMembers], ['Expired', r.expiredMembers], ['Awaiting payment', r.pendingPayment]]} />
          </Card>
        </div>
      )}
    </QueryState>
  );
}

function MerchReport({ clubId }) {
  const q = useQuery({ queryKey: ['reports', 'merchandise', clubId], queryFn: () => reportsApi.merchandise(clubId) });
  return (
    <QueryState query={q} loading={<CardsSkeleton />}>
      {(r) => (
        <div className="stack-lg">
          <div className="grid grid-4">
            <StatCard label="Merch revenue" value={<Money paise={r.revenuePaise} />} tone="info" />
            <StatCard label="Units sold" value={r.unitsSold.reduce((s, u) => s + u.units, 0)} />
            <StatCard label="Awaiting pickup" value={r.ordersByStatus.CONFIRMED || 0} tone="warning" />
            <StatCard label="Open stock alerts" value={r.openAlerts} tone={r.openAlerts ? 'danger' : 'success'} />
          </div>
          <div className="grid grid-main-side">
            <Card title="Units sold by product and size" flush>
              <DataTable
                caption="Units sold"
                rowKey={(u) => `${u.productName}-${u.sizeLabel}`}
                rows={r.unitsSold}
                empty={<EmptyState icon={TShirt} title="No sales yet" />}
                columns={[
                  { key: 'productName', header: 'Product', sortable: true },
                  { key: 'sizeLabel', header: 'Size', render: (u) => sizeLabel(u.sizeLabel) },
                  { key: 'units', header: 'Units', align: 'right', sortable: true },
                  { key: 'revenuePaise', header: 'Revenue', align: 'right', sortable: true, render: (u) => <Money paise={u.revenuePaise} /> },
                ]}
              />
            </Card>
            <Card title="Orders by status">
              <Donut data={Object.entries(r.ordersByStatus).map(([k, v]) => ({ label: k.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), value: v }))} caption="Orders by status" />
            </Card>
          </div>
        </div>
      )}
    </QueryState>
  );
}

function FinanceReport({ clubId }) {
  const q = useQuery({ queryKey: ['reports', 'finance', clubId], queryFn: () => reportsApi.finance(clubId) });
  return (
    <QueryState query={q} loading={<CardsSkeleton />}>
      {(r) => (
        <div className="stack-lg">
          <div className="grid grid-4">
            <StatCard label="Total income" value={<Money paise={r.totalIncomePaise} />} tone="success" />
            <StatCard label="Expenses paid" value={<Money paise={r.totalPaidExpensesPaise} />} tone="accent" />
            <StatCard label="Available balance" value={<Money paise={r.availableBalancePaise} />} />
            <StatCard label="Projected balance" value={<Money paise={r.projectedBalancePaise} />} tone="info" hint="After approved, unpaid claims" />
          </div>
          <Card title="Monthly income and expenses">
            <BarSeries data={r.monthly} xKey="month" xFormat={formatMonth} format={(v, axis) => formatMoney(v, { compact: axis })} caption="Monthly income and expenses" series={[{ key: 'inPaise', label: 'Income' }, { key: 'outPaise', label: 'Expenses', colorIndex: 2 }]} />
          </Card>
          <div className="grid grid-2">
            <Card title="Income by category">
              <Donut data={Object.entries(r.incomeByCategory).map(([k, v]) => ({ label: LABELS.ledgerCategory[k], value: v })).sort((a, b) => b.value - a.value).slice(0, 5)} format={(v) => formatMoney(v)} caption="Income by category" />
            </Card>
            <Card title="Expenses by category">
              <Donut data={Object.entries(r.outByCategory).map(([k, v]) => ({ label: LABELS.ledgerCategory[k], value: v }))} format={(v) => formatMoney(v)} caption="Expenses by category" />
            </Card>
          </div>
        </div>
      )}
    </QueryState>
  );
}

export default function Reports() {
  const { clubId } = useParams();
  const [tab, setTab] = useState('events');
  return (
    <>
      <PageHeader title="Reports" description="Attendance, membership, merchandise and finance, computed from settled records." />
      <Tabs
        label="Report type"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'events', label: 'Events', icon: CalendarBlank },
          { value: 'memberships', label: 'Memberships', icon: IdentificationBadge },
          { value: 'merch', label: 'Merchandise', icon: TShirt },
          { value: 'finance', label: 'Finance', icon: Coins },
        ]}
      />
      <TabPanel value={tab}>
        {tab === 'events' && <EventsReport clubId={clubId} />}
        {tab === 'memberships' && <MembershipReport clubId={clubId} />}
        {tab === 'merch' && <MerchReport clubId={clubId} />}
        {tab === 'finance' && <FinanceReport clubId={clubId} />}
      </TabPanel>
    </>
  );
}
