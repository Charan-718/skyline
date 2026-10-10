import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Plus, Prohibit, RocketLaunch, Warning } from '@phosphor-icons/react';
import { fundraisersApi } from '../../api/endpoints';
import { Card, PageHeader, StatCard } from '../../components/layout';
import { Alert, Badge, ErrorState, ProgressBar, StatusBadge, PageLoader } from '../../components/feedback';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/Modal';
import { Money } from '../../components/domain';
import { TaskDialog } from '../../components/TaskDialog';
import { useToast } from '../../components/Toast';
import { formatDate, formatRelative, formatDateTime } from '../../utils/dates';
import { formatMoney } from '../../utils/money';
import { HEALTH_TONE } from './Fundraisers';

const HEALTH_TEXT = {
  ON_TRACK: 'Task progress is keeping pace with the calendar.',
  AT_RISK: 'Task progress is falling behind the time elapsed.',
  OFF_TRACK: 'There are overdue tasks, or the target date has passed with work remaining.',
  NO_TASKS: 'Add tasks so progress can be tracked.',
};

const COLUMNS = [
  { status: 'TODO', title: 'To do' },
  { status: 'IN_PROGRESS', title: 'In progress' },
  { status: 'DONE', title: 'Done' },
];

export default function FundraiserDetail() {
  const { fundraiserId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [task, setTask] = useState(undefined);
  const [confirm, setConfirm] = useState(null);
  const q = useQuery({ queryKey: ['fundraiser', fundraiserId], queryFn: () => fundraisersApi.overview(fundraiserId) });
  const setStatus = useMutation({
    mutationFn: (status) => fundraisersApi.update(fundraiserId, { status }),
    onSuccess: (f) => {
      qc.invalidateQueries({ queryKey: ['fundraiser', fundraiserId] });
      qc.invalidateQueries({ queryKey: ['fundraisers'] });
      setConfirm(null);
      toast.success(`Fundraiser ${f.status.toLowerCase()}`);
    },
    onError: (e) => {
      setConfirm(null);
      toast.error(e);
    },
  });
  if (q.isPending) return <PageLoader />;
  if (q.isError) return <div className="card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const d = q.data;
  const f = d.fundraiser;
  const head = d.viewerIsClubHead;
  const open = ['PLANNING', 'ACTIVE'].includes(f.status);
  const cancelled = d.tasks.filter((t) => t.status === 'CANCELLED');

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Fundraisers', to: `/manage/${f.clubId}/fundraisers` }, { label: f.name }]}
        title={f.name}
        badge={<StatusBadge status={f.status === 'ACTIVE' ? d.health : f.status} />}
        description={`${formatDate(f.startsOn)} – ${formatDate(f.targetDate)} · ${f.description}`}
        actions={
          head && (
            <>
              {f.status === 'PLANNING' && <Button variant="primary" icon={RocketLaunch} onClick={() => setConfirm('ACTIVE')}>Mark active</Button>}
              {f.status === 'ACTIVE' && <Button variant="primary" icon={CheckCircle} onClick={() => setConfirm('COMPLETED')}>Complete</Button>}
              {open && <Button variant="ghost" icon={Prohibit} onClick={() => setConfirm('CANCELLED')}>Cancel</Button>}
              {open && <Button icon={Plus} onClick={() => setTask(null)}>Add task</Button>}
            </>
          )
        }
      />
      <div className="stack-lg">
        {f.status === 'ACTIVE' && HEALTH_TEXT[d.health] && (
          <Alert tone={HEALTH_TONE[d.health] === 'success' ? 'success' : HEALTH_TONE[d.health] || 'info'} title={<StatusBadge status={d.health} />}>{HEALTH_TEXT[d.health]}</Alert>
        )}
        <div className="grid grid-4">
          <StatCard label="Task progress" value={`${d.progressPct}%`} hint={`${d.timeElapsedPct}% of time elapsed`} tone={HEALTH_TONE[d.health] || 'primary'} />
          <StatCard label="Pending tasks" value={d.counts.todo + d.counts.inProgress} hint={`${d.counts.done} done`} tone="info" />
          <StatCard label="Overdue" value={d.counts.overdue} tone={d.counts.overdue ? 'danger' : 'success'} icon={d.counts.overdue ? Warning : undefined} />
          <StatCard label="Raised" value={<Money paise={d.money.incomePaise} />} hint={`${d.money.goalPct != null ? `${d.money.goalPct}% of goal · ` : ''}net ${formatMoney(d.money.netPaise)} after expenses`} tone="success" />
        </div>
        {d.money.goalPct != null && (
          <Card>
            <ProgressBar value={d.money.incomePaise} max={f.goalAmountPaise} label={`Raised towards goal of ${formatMoney(f.goalAmountPaise)}`} tone="success" />
          </Card>
        )}
        <div className="board">
          {COLUMNS.map((col) => {
            const tasks = d.tasks.filter((t) => t.status === col.status);
            return (
              <section key={col.status} className="board-col" aria-label={col.title}>
                <h3>
                  {col.title} <Badge dot={false}>{tasks.length}</Badge>
                </h3>
                {!tasks.length && <p className="subtle" style={{ padding: '0 4px' }}>No tasks</p>}
                {tasks.map((t) => (
                  <button key={t.id} type="button" className="task-card" data-overdue={t.overdue} onClick={() => setTask(t)} aria-label={`${t.title}, ${t.assigneeName || 'unassigned'}, due ${formatDateTime(t.deadline)}${t.overdue ? ', overdue' : ''}`}>
                    <span className="cell-title">{t.title}</span>
                    <span className="row-between subtle" style={{ width: '100%' }}>
                      <span>{t.assigneeName || 'Unassigned'}</span>
                      <span style={{ color: t.overdue ? 'var(--color-danger)' : undefined, fontWeight: t.overdue ? 700 : undefined }}>{t.overdue ? 'Overdue · ' : ''}{formatRelative(t.deadline)}</span>
                    </span>
                    {t.status === 'IN_PROGRESS' && <ProgressBar value={t.progressPercent} showValue={false} label={`${t.progressPercent}% done`} />}
                  </button>
                ))}
              </section>
            );
          })}
        </div>
        {cancelled.length > 0 && <p className="subtle">{cancelled.length} cancelled task{cancelled.length > 1 ? 's' : ''} not counted in progress.</p>}
      </div>
      <TaskDialog open={task !== undefined} onClose={() => setTask(undefined)} task={task} fundraiserId={fundraiserId} isHead={head} assignees={d.assignees} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => setStatus.mutate(confirm)} loading={setStatus.isPending} tone={confirm === 'CANCELLED' ? 'danger' : 'primary'} title={confirm === 'ACTIVE' ? 'Mark fundraiser active?' : confirm === 'COMPLETED' ? 'Complete fundraiser?' : 'Cancel fundraiser?'} confirmLabel={confirm === 'ACTIVE' ? 'Mark active' : confirm === 'COMPLETED' ? 'Complete' : 'Cancel fundraiser'}>
        {confirm === 'COMPLETED' ? 'No more tasks can be added. Income and expenses remain in the ledger.' : confirm === 'CANCELLED' ? 'The fundraiser will close and stop appearing as active.' : 'Health tracking starts and the team sees it as active.'}
      </ConfirmDialog>
    </>
  );
}
