import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarBlank, MagnifyingGlass } from '@phosphor-icons/react';
import { clubsApi, eventsApi } from '../../api/endpoints';
import { PageHeader } from '../../components/layout';
import { CardsSkeleton, EmptyState, QueryState } from '../../components/feedback';
import { Input, Select } from '../../components/forms';
import { Checkbox } from '../../components/forms';
import { Pagination } from '../../components/DataTable';
import { EventCard } from '../../components/cards';

export default function Events() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const clubId = params.get('clubId') || '';
  const includePast = params.get('past') === '1';
  const page = Number(params.get('page') || 1);
  const clubs = useQuery({ queryKey: ['clubs'], queryFn: () => clubsApi.list() });
  const events = useQuery({
    queryKey: ['events', { clubId, includePast, page, q: params.get('q') }],
    queryFn: () => eventsApi.list({ clubId, includePast, page, pageSize: 12, q: params.get('q') }),
    placeholderData: keepPreviousData,
  });
  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader title="Events" description="Book tickets online. Members see their discounted price automatically." />
      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <form
          className="toolbar"
          style={{ borderBottom: 0 }}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q });
          }}
        >
          <div className="input-group grow">
            <MagnifyingGlass size={16} className="prefix" aria-hidden />
            <Input type="search" placeholder="Search events or venues" aria-label="Search events" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => update({ q })} />
          </div>
          <Select aria-label="Filter by club" value={clubId} onChange={(e) => update({ clubId: e.target.value })} placeholder="All clubs" options={(clubs.data || []).map((c) => ({ value: c.id, label: c.name }))} style={{ width: 'auto', minWidth: 180 }} />
          <Checkbox label="Include past events" checked={includePast} onChange={(e) => update({ past: e.target.checked ? '1' : '' })} />
        </form>
      </div>
      <QueryState
        query={events}
        loading={<CardsSkeleton count={6} />}
        isEmpty={(d) => !d.data.length}
        empty={
          <div className="card">
            <EmptyState icon={CalendarBlank} title="No events match">Try another club or clear your search.</EmptyState>
          </div>
        }
      >
        {(d) => (
          <div className="stack">
            <div className="grid grid-3" aria-busy={events.isFetching}>
              {d.data.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
            <div className="card">
              <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => update({ page: String(p) })} />
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}
