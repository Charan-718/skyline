import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowCounterClockwise, Bell, EnvelopeSimple, Play, Student } from '@phosphor-icons/react';
import { devApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Card, PageHeader } from '../../components/layout';
import { Alert, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { Field, Input, Select } from '../../components/forms';
import { ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { formatDateTime, todayInput } from '../../utils/dates';
import { label } from '../../utils/status';

const JOBS = [
  { name: 'renewal-reminders', label: '7-day renewal reminders', help: 'Queues one reminder email per term expiring within 7 days. Re-running never duplicates.' },
  { name: 'autopay-renewals', label: 'AutoPay renewals', help: 'Attempts renewal for AutoPay members whose membership expires on the chosen date.' },
  { name: 'membership-expiry', label: 'Membership expiry', help: 'Marks memberships past their expiry date as EXPIRED.' },
];

export default function DevTools() {
  const qc = useQueryClient();
  const toast = useToast();
  const { refresh } = useAuth();
  const [job, setJob] = useState(JOBS[0].name);
  const [asOf, setAsOf] = useState(todayInput());
  const [outcome, setOutcome] = useState('SUCCEEDED');
  const [channel, setChannel] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const outbox = useQuery({ queryKey: ['dev', 'outbox', channel], queryFn: () => devApi.outbox({ channel }) });
  const fixtures = useQuery({ queryKey: ['dev', 'college'], queryFn: () => devApi.collegeMock() });
  const candidates = useQuery({ queryKey: ['dev', 'autopay'], queryFn: () => devApi.autopayCandidates() });
  const run = useMutation({
    mutationFn: () => devApi.runJob(job, { asOf, autopayOutcome: outcome }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      toast.success(`Ran ${r.job}`, JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !['job', 'ranAt', 'note', 'results'].includes(k)))));
    },
    onError: (e) => toast.error(e),
  });
  const reset = useMutation({
    mutationFn: () => devApi.reset(),
    onSuccess: async () => {
      setResetOpen(false);
      qc.clear();
      await refresh();
      window.location.assign('/login');
    },
  });
  const selected = JOBS.find((j) => j.name === job);
  return (
    <>
      <PageHeader title="Dev tools" description="Demo-only helpers (LLD §4.11). Hidden when connected to the real backend." actions={<Button variant="danger" icon={ArrowCounterClockwise} onClick={() => setResetOpen(true)}>Reset demo data</Button>} />
      <div className="grid grid-2">
        <Card title="Run a scheduled job">
          <form className="stack" onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
            <Field label="Job" hint={selected.help}>
              <Select value={job} onChange={(e) => setJob(e.target.value)} options={JOBS.map((j) => ({ value: j.name, label: j.label }))} />
            </Field>
            <div className="form-grid">
              <Field label="Run as of date"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
              {job === 'autopay-renewals' && (
                <Field label="Simulated outcome">
                  <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} options={['SUCCEEDED', 'FAILED', 'PENDING'].map((o) => ({ value: o, label: label('x', o) }))} />
                </Field>
              )}
            </div>
            {job === 'autopay-renewals' && candidates.data?.length > 0 && (
              <Alert tone="info">AutoPay members: {candidates.data.map((c) => `${c.memberName} (${c.clubName}) expires ${c.expiresOn}`).join('; ')}. Set the date to an expiry to trigger it.</Alert>
            )}
            <div><Button type="submit" variant="primary" icon={Play} loading={run.isPending}>Run job</Button></div>
          </form>
        </Card>
        <Card title="College verification fixtures" description="Mock student database used by the verification adapter.">
          <QueryState query={fixtures}>
            {(rows) => (
              <DataTable caption="Student fixtures" rowKey="studentIdentifier" rows={rows} columns={[{ key: 'studentIdentifier', header: 'Student ID', render: (r) => <span className="mono">{r.studentIdentifier}</span> }, { key: 'fullName', header: 'Name' }, { key: 'linked', header: 'Linked', render: (r) => (r.linked ? 'Yes' : <strong style={{ color: 'var(--color-success)' }}>Available</strong>) }]} />
            )}
          </QueryState>
          <p className="subtle row" style={{ gap: 6, marginTop: 8 }}><Student size={16} aria-hidden /> Use an available ID on Profile → Verify.</p>
        </Card>
        <Card title="Notification outbox" description="Emails the dev adapters would have sent." className="span-2" actions={<Select aria-label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="All channels" options={[{ value: 'EMAIL', label: 'Email' }]} style={{ width: 'auto' }} />} flush>
          <QueryState query={outbox}>
            {(rows) => (
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                <DataTable
                  caption="Outbox"
                  rows={rows}
                  columns={[
                    { key: 'createdAt', header: 'Queued', render: (d) => formatDateTime(d.createdAt) },
                    { key: 'channel', header: 'Channel', render: (d) => <span className="row" style={{ gap: 4 }}>{d.channel === 'EMAIL' ? <EnvelopeSimple size={14} aria-hidden /> : <Bell size={14} aria-hidden />}{d.channel}</span> },
                    { key: 'template', header: 'Message', render: (d) => <div><div className="cell-title">{label('template', d.template)}</div><div className="cell-sub">{d.payload?.title || d.payload?.eventTitle || (d.payload?.expiresOn && `Expires ${d.payload.expiresOn}`) || d.payload?.status || ''}</div></div> },
                    { key: 'recipientName', header: 'To' },
                    { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
                  ]}
                />
              </div>
            )}
          </QueryState>
        </Card>
      </div>
      <ConfirmDialog open={resetOpen} onClose={() => setResetOpen(false)} onConfirm={() => reset.mutate()} loading={reset.isPending} tone="danger" title="Reset all demo data?" confirmLabel="Reset">
        Everything you created in this browser is replaced with fresh seed data and you will be signed out.
      </ConfirmDialog>
    </>
  );
}
