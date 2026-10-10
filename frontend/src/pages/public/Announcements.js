import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Megaphone } from '@phosphor-icons/react';
import { announcementsApi, clubsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Card, PageHeader } from '../../components/layout';
import { EmptyState, QueryState } from '../../components/feedback';
import { Select } from '../../components/forms';
import { Pagination, Toolbar } from '../../components/DataTable';
import { AnnouncementItem } from '../../components/cards';
import { LABELS } from '../../utils/status';

export default function Announcements() {
  const { user } = useAuth();
  const [clubId, setClubId] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const clubs = useQuery({ queryKey: ['clubs'], queryFn: () => clubsApi.list() });
  const feed = useQuery({ queryKey: ['announcements', 'feed', clubId, category, page, !!user], queryFn: () => announcementsApi.feed({ clubId, category, page, pageSize: 10 }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Announcements" description={user ? 'Public notices plus members-only updates from your clubs.' : 'Public notices from every club. Sign in to see members-only updates.'} />
      <Card flush>
        <Toolbar>
          <Select aria-label="Filter by club" value={clubId} onChange={(e) => { setClubId(e.target.value); setPage(1); }} placeholder="All clubs" options={(clubs.data || []).map((c) => ({ value: c.id, label: c.name }))} style={{ width: 'auto' }} />
          <Select aria-label="Filter by category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} placeholder="All categories" options={Object.entries(LABELS.category).map(([value, label]) => ({ value, label }))} style={{ width: 'auto' }} />
        </Toolbar>
        <QueryState query={feed} isEmpty={(d) => !d.data.length} empty={<EmptyState icon={Megaphone} title="No announcements">Nothing matches these filters yet.</EmptyState>}>
          {(d) => (
            <>
              <ul className="list">
                {d.data.map((a) => (
                  <li key={a.id} style={{ padding: 'var(--space-5)' }}>
                    <AnnouncementItem a={a} />
                  </li>
                ))}
              </ul>
              <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </>
  );
}
