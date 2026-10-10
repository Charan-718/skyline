import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardText } from '@phosphor-icons/react';
import { fundraisersApi } from '../../api/endpoints';
import { PageHeader, Segmented } from '../../components/layout';
import { CardsSkeleton, EmptyState, ProgressBar, QueryState, StatusBadge } from '../../components/feedback';
import { TaskDialog } from '../../components/TaskDialog';
import { formatDateTime, formatRelative } from '../../utils/dates';

export default function Tasks() {
  const [filter, setFilter] = useState('open');
  const [editing, setEditing] = useState(null);
  const q = useQuery({ queryKey: ['tasks', 'mine'], queryFn: () => fundraisersApi.myTasks() });
  const visible = (rows) => rows.filter((t) => (filter === 'open' ? ['TODO', 'IN_PROGRESS'].includes(t.status) : filter === 'done' ? t.status === 'DONE' : true));
  return (
    <>
      <PageHeader
        title="My tasks"
        description="Fundraiser work assigned to you. Update progress so the team knows what's left."
        actions={<Segmented label="Filter tasks" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }]} />}
      />
      <QueryState query={q} loading={<CardsSkeleton count={3} />} isEmpty={(rows) => !visible(rows).length} empty={<div className="card"><EmptyState icon={ClipboardText} title={filter === 'open' ? 'Nothing pending' : 'No tasks here'}>{filter === 'open' ? 'You are all caught up.' : 'Tasks assigned to you will show up here.'}</EmptyState></div>}>
        {(rows) => (
          <div className="grid grid-3">
            {visible(rows).map((t) => (
              <button key={t.id} type="button" className="card task-card" data-overdue={t.overdue} style={{ padding: 'var(--space-4)' }} onClick={() => setEditing(t)} aria-label={`Update task ${t.title}`}>
                <div className="row-between" style={{ width: '100%' }}>
                  <span className="subtle">{t.clubName} · {t.fundraiserName}</span>
                </div>
                <h2 style={{ fontSize: 'var(--font-size-base)' }}>{t.title}</h2>
                <div className="row">
                  <StatusBadge status={t.status} />
                  {t.overdue && <StatusBadge status="OFF_TRACK" label="Overdue" />}
                </div>
                <span className="subtle" title={formatDateTime(t.deadline)}>Due {formatRelative(t.deadline)}</span>
                <div style={{ width: '100%' }}>
                  <ProgressBar value={t.progressPercent} label="Progress" />
                </div>
              </button>
            ))}
          </div>
        )}
      </QueryState>
      <TaskDialog open={!!editing} onClose={() => setEditing(null)} task={editing} isHead={false} />
    </>
  );
}
