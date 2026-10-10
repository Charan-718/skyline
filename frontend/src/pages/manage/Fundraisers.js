import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, Plus } from '@phosphor-icons/react';
import { fundraisersApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { PageHeader, Segmented } from '../../components/layout';
import { Alert, CardsSkeleton, EmptyState, ProgressBar, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Field, Input, MoneyInput, Textarea, required, useForm } from '../../components/forms';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/domain';
import { useToast } from '../../components/Toast';
import { formatDate } from '../../utils/dates';
import { rupeesToPaise } from '../../utils/money';
import { errorMessage } from '../../utils/errorMessages';

export const HEALTH_TONE = { ON_TRACK: 'success', AT_RISK: 'warning', OFF_TRACK: 'danger' };

function NewFundraiser({ open, onClose, clubId }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm({ name: '', description: '', startsOn: '', targetDate: '', goal: '' });
  const create = useMutation({
    mutationFn: (b) => fundraisersApi.create(clubId, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fundraisers', clubId] });
      toast.success('Fundraiser created', 'Add tasks, then mark it active.');
      form.reset();
      onClose();
    },
    onError: (e) => form.applyServerErrors(e),
  });
  return (
    <Modal open={open} onClose={onClose} title="New fundraiser" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="fund-form" loading={create.isPending}>Create</Button></>}>
      <form
        id="fund-form"
        className="form-grid"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const v = form.values;
          if (!form.validate({ name: required('Enter a name.'), startsOn: required('Required.'), targetDate: (x) => (!x ? 'Required.' : x <= v.startsOn ? 'Must be after the start.' : null), goal: (x) => (x && !rupeesToPaise(x) ? 'Enter a valid amount.' : null) })) return;
          create.mutate({ name: v.name, description: v.description, startsOn: v.startsOn, targetDate: v.targetDate, goalAmountPaise: v.goal ? rupeesToPaise(v.goal) : null });
        }}
      >
        {create.isError && !Object.keys(create.error.details?.fields || {}).length && <div className="full"><Alert tone="danger">{errorMessage(create.error)}</Alert></div>}
        <Field label="Name" error={form.errors.name} required className="full"><Input {...form.bind('name')} /></Field>
        <Field label="Starts" error={form.errors.startsOn} required><Input type="date" {...form.bind('startsOn')} /></Field>
        <Field label="Target date" error={form.errors.targetDate} required><Input type="date" {...form.bind('targetDate')} /></Field>
        <Field label="Money goal" error={form.errors.goal || form.errors.goalAmountPaise} hint="Optional." className="full"><MoneyInput {...form.bind('goal')} /></Field>
        <Field label="Description" className="full"><Textarea rows={3} {...form.bind('description')} /></Field>
      </form>
    </Modal>
  );
}

export default function Fundraisers() {
  const { clubId } = useParams();
  const { hasRole } = useAuth();
  const head = hasRole(clubId, 'CLUB_HEAD');
  const [filter, setFilter] = useState('open');
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['fundraisers', clubId], queryFn: () => fundraisersApi.list(clubId) });
  const visible = (rows) => rows.filter((f) => (filter === 'open' ? ['PLANNING', 'ACTIVE'].includes(f.status) : !['PLANNING', 'ACTIVE'].includes(f.status)));
  return (
    <>
      <PageHeader title="Fundraisers" description="Split the work into tasks, see what's left and whether you're on track." actions={<>{<Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} />}{head && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New fundraiser</Button>}</>} />
      <QueryState query={q} loading={<CardsSkeleton count={3} />} isEmpty={(rows) => !visible(rows).length} empty={<div className="card"><EmptyState icon={HandCoins} title="No fundraisers here" action={head && filter === 'open' && <Button onClick={() => setCreating(true)}>Start a fundraiser</Button>} /></div>}>
        {(rows) => (
          <div className="grid grid-3">
            {visible(rows).map((f) => (
              <Link key={f.id} to={`/manage/fundraisers/${f.id}`} className="card card-link">
                <div className="card-body stack">
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <h2 style={{ fontSize: 'var(--font-size-base)' }}>{f.name}</h2>
                    <StatusBadge status={['ACTIVE'].includes(f.status) ? f.health : f.status} />
                  </div>
                  <p className="subtle">{formatDate(f.startsOn)} – {formatDate(f.targetDate)}</p>
                  <ProgressBar value={f.progressPct} label="Task progress" tone={HEALTH_TONE[f.health]} />
                  <ProgressBar value={f.timeElapsedPct} label="Time elapsed" tone="info" />
                  <div className="row-between subtle">
                    <span><span className="num">{(f.counts?.todo ?? 0) + (f.counts?.inProgress ?? 0)}</span> pending{(f.counts?.overdue ?? 0) > 0 && <strong style={{ color: 'var(--color-danger)' }}> · {f.counts.overdue} overdue</strong>}</span>
                    {f.goalAmountPaise && f.money && <span><Money paise={f.money.incomePaise} compact /> / <Money paise={f.goalAmountPaise} compact /></span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </QueryState>
      <NewFundraiser open={creating} onClose={() => setCreating(false)} clubId={clubId} />
    </>
  );
}
