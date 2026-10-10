import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarBlank, HandCoins, Package, Receipt, Users, Wallet, Warning } from '@phosphor-icons/react';
import { eventsApi, financeApi, fundraisersApi, merchApi, reportsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { useClub } from '../../hooks';
import { Card, PageHeader, StatCard } from '../../components/layout';
import { CardsSkeleton, EmptyState, LoadingState, ProgressBar, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { BarSeries, Donut } from '../../components/charts';
import { DateTile, Money } from '../../components/domain';
import { formatMoney } from '../../utils/money';
import { formatDateTime, formatMonth } from '../../utils/dates';
import { LABELS } from '../../utils/status';

export default function Dashboard() {
  const { clubId } = useParams();
  const { hasRole } = useAuth();
  const club = useClub(clubId);
  const head = hasRole(clubId, 'CLUB_HEAD');
  const lead = hasRole(clubId, 'CLUB_HEAD', 'TREASURER');

  const summary = useQuery({ queryKey: ['finance', 'summary', clubId], queryFn: () => financeApi.summary(clubId) });
  const members = useQuery({ queryKey: ['reports', 'memberships', clubId], queryFn: () => reportsApi.memberships(clubId), enabled: lead });
  const events = useQuery({ queryKey: ['events', 'club', clubId, 'all'], queryFn: () => eventsApi.clubEvents(clubId, { all: true }) });
  const alerts = useQuery({ queryKey: ['low-stock', clubId, 'OPEN'], queryFn: () => merchApi.lowStockAlerts(clubId, { status: 'OPEN' }), enabled: lead });
  const pending = useQuery({ queryKey: ['expenses', clubId, 'SUBMITTED'], queryFn: () => financeApi.expenses(clubId, { status: 'SUBMITTED' }), enabled: lead });
  const funds = useQuery({ queryKey: ['fundraisers', clubId], queryFn: () => fundraisersApi.list(clubId) });

  const s = summary.data;
  const upcoming = (events.data || []).filter((e) => e.status === 'PUBLISHED').sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
  const incomeDonut = s ? Object.entries(s.incomeByCategory).map(([k, v]) => ({ label: LABELS.ledgerCategory[k], value: v })).sort((a, b) => b.value - a.value) : [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={club.data ? `${club.data.name} at a glance` : ' '}
        actions={
          head && (
            <>
              <Button to={`/manage/${clubId}/announcements`}>New announcement</Button>
              <Button variant="primary" to={`/manage/${clubId}/events/new`}>
                Create event
              </Button>
            </>
          )
        }
      />
      <div className="stack-lg">
        {summary.isPending ? (
          <CardsSkeleton count={4} />
        ) : (
          <div className="grid grid-4">
            <StatCard icon={Wallet} label="Available balance" value={<Money paise={s?.availableBalancePaise} />} hint={s && `Projected ${formatMoney(s.projectedBalancePaise)} after approved payouts`} to={`/manage/${clubId}/finance`} />
            {lead ? (
              <StatCard icon={Users} tone="success" label="Active members" value={members.data?.activeMembers ?? '–'} hint={members.data && `${members.data.expiringIn7Days} expiring in 7 days`} to={`/manage/${clubId}/members`} />
            ) : (
              <StatCard icon={CalendarBlank} tone="success" label="Upcoming events" value={upcoming.length} />
            )}
            {lead ? (
              <StatCard icon={Receipt} tone="warning" label="Claims to review" value={pending.data?.total ?? '–'} hint={s && `${formatMoney(s.pendingReviewTotalPaise)} awaiting review`} to={`/manage/${clubId}/finance?tab=expenses`} />
            ) : (
              <StatCard icon={Receipt} tone="warning" label="Pending review" value={<Money paise={s?.pendingReviewTotalPaise} />} />
            )}
            {lead ? (
              <StatCard icon={Package} tone={alerts.data?.length ? 'danger' : 'info'} label="Low-stock alerts" value={alerts.data?.length ?? '–'} hint="Sizes at or below threshold" to={`/manage/${clubId}/merchandise?tab=alerts`} />
            ) : (
              <StatCard icon={HandCoins} tone="info" label="Active fundraisers" value={(funds.data || []).filter((f) => f.status === 'ACTIVE').length} />
            )}
          </div>
        )}

        <div className="grid grid-main-side">
          <Card title="Money in vs out" description="Settled ledger amounts by month">
            <QueryState query={summary}>
              {(d) => (
                <BarSeries
                  data={d.monthly}
                  xKey="month"
                  xFormat={formatMonth}
                  format={(v, axis) => formatMoney(v, { compact: axis })}
                  caption="Monthly income and expenses"
                  series={[
                    { key: 'inPaise', label: 'Income' },
                    { key: 'outPaise', label: 'Expenses', colorIndex: 2 },
                  ]}
                />
              )}
            </QueryState>
          </Card>
          <Card title="Income sources">
            <QueryState query={summary}>
              {() => <Donut data={incomeDonut.slice(0, 5)} format={(v) => formatMoney(v)} caption="Income by category" centerLabel={<div><div className="subtle">Total</div><div className="cell-title num">{formatMoney(s.totalIncomePaise, { compact: true })}</div></div>} />}
            </QueryState>
          </Card>
        </div>

        <div className="grid grid-2">
          <Card title="Upcoming events" actions={lead && <Button size="sm" variant="ghost" iconRight={ArrowRight} to={`/manage/${clubId}/events`}>All events</Button>}>
            {events.isPending ? (
              <LoadingState />
            ) : !upcoming.length ? (
              <EmptyState icon={CalendarBlank} title="No published events" action={head && <Button to={`/manage/${clubId}/events/new`}>Create event</Button>} />
            ) : (
              <ul className="list">
                {upcoming.slice(0, 4).map((e) => (
                  <li key={e.id} style={{ paddingInline: 0 }}>
                    <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                      <DateTile iso={e.startsAt} />
                      <div className="stack-sm" style={{ flex: 1, minWidth: 0, gap: 6 }}>
                        <div className="row-between">
                          <Link to={`/manage/events/${e.id}`} className="cell-title wrap-anywhere">
                            {e.title}
                          </Link>
                          <StatusBadge status={e.salesStatus} />
                        </div>
                        <span className="subtle">{formatDateTime(e.startsAt)}</span>
                        <ProgressBar value={e.ticketsSold} max={e.capacity} label={`${e.ticketsSold} / ${e.capacity} sold`} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Fundraisers" actions={<Button size="sm" variant="ghost" iconRight={ArrowRight} to={`/manage/${clubId}/fundraisers`}>All</Button>}>
            <QueryState query={funds} isEmpty={(d) => !d.filter((f) => f.status === 'ACTIVE').length} empty={<EmptyState icon={HandCoins} title="No active fundraisers" />}>
              {(list) => (
                <ul className="list">
                  {list
                    .filter((f) => f.status === 'ACTIVE')
                    .map((f) => (
                      <li key={f.id} style={{ paddingInline: 0 }} className="stack-sm">
                        <div className="row-between">
                          <Link to={`/manage/fundraisers/${f.id}`} className="cell-title">
                            {f.name}
                          </Link>
                          <StatusBadge status={f.health} />
                        </div>
                        <ProgressBar value={f.progressPct} label={`Tasks ${f.counts.done}/${f.counts.todo + f.counts.inProgress + f.counts.done} done${f.counts.overdue ? ` · ${f.counts.overdue} overdue` : ''}`} tone={f.health === 'OFF_TRACK' ? 'danger' : f.health === 'AT_RISK' ? 'warning' : 'success'} />
                        {f.money.goalPct != null && <span className="subtle">Raised <Money paise={f.money.incomePaise} /> of <Money paise={f.goalAmountPaise} /> goal</span>}
                      </li>
                    ))}
                </ul>
              )}
            </QueryState>
          </Card>
        </div>

        {lead && alerts.data?.length > 0 && (
          <Card title="Needs attention">
            <ul className="list">
              {alerts.data.slice(0, 5).map((a) => (
                <li key={a.id} className="row" style={{ paddingInline: 0 }}>
                  <Warning size={18} color="var(--color-warning)" aria-hidden />
                  <span>
                    <strong>{a.productName}</strong> size {a.sizeLabel} is low: <span className="num">{a.availableNow}</span> left (threshold {a.threshold})
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
