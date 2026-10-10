import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarBlank, Plus } from '@phosphor-icons/react';
import { eventsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Card, PageHeader, Segmented } from '../../components/layout';
import { EmptyState, ProgressBar, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { Money } from '../../components/domain';
import { formatDateTime } from '../../utils/dates';

const FILTERS = { upcoming: (e) => ['PUBLISHED', 'DRAFT'].includes(e.status), past: (e) => e.status === 'COMPLETED', cancelled: (e) => e.status === 'CANCELLED', all: () => true };

export default function ManageEvents() {
  const { clubId } = useParams();
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('upcoming');
  const q = useQuery({ queryKey: ['events', 'club', clubId, 'all'], queryFn: () => eventsApi.clubEvents(clubId, { all: true }) });
  const head = hasRole(clubId, 'CLUB_HEAD');
  return (
    <>
      <PageHeader title="Events" description="Create, publish and monitor ticket sales." actions={head && <Button variant="primary" icon={Plus} to={`/manage/${clubId}/events/new`}>Create event</Button>} />
      <Card flush>
        <div className="toolbar">
          <Segmented label="Filter events" value={filter} onChange={setFilter} options={[{ value: 'upcoming', label: 'Upcoming & drafts' }, { value: 'past', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' }]} />
        </div>
        <QueryState query={q} isEmpty={(d) => !d.filter(FILTERS[filter]).length} empty={<EmptyState icon={CalendarBlank} title="No events here" action={head && <Button to={`/manage/${clubId}/events/new`}>Create event</Button>} />}>
          {(rows) => (
            <DataTable
              caption="Club events"
              rows={rows.filter(FILTERS[filter])}
              onRowClick={(e) => navigate(`/manage/events/${e.id}`)}
              initialSort={{ key: 'startsAt', dir: filter === 'past' ? 'desc' : 'asc' }}
              columns={[
                { key: 'title', header: 'Event', sortable: true, render: (e) => <div><Link to={`/manage/events/${e.id}`} className="cell-title" onClick={(ev) => ev.stopPropagation()}>{e.title}</Link><div className="cell-sub">{e.venue}</div></div> },
                { key: 'startsAt', header: 'Starts', sortable: true, render: (e) => formatDateTime(e.startsAt) },
                { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status === 'PUBLISHED' ? e.salesStatus : e.status} /> },
                { key: 'ticketsSold', header: 'Sold', sortable: true, render: (e) => <div style={{ minWidth: 120 }}><ProgressBar value={e.ticketsSold} max={e.capacity} label={`${e.ticketsSold}/${e.capacity}`} showValue={false} /></div> },
                { key: 'memberPricePaise', header: 'Price (member / std)', align: 'right', hideOnMobile: true, render: (e) => <><Money paise={e.memberPricePaise} /> / {e.nonMemberPricePaise == null ? 'Members only' : <Money paise={e.nonMemberPricePaise} />}</> },
              ]}
            />
          )}
        </QueryState>
      </Card>
    </>
  );
}
