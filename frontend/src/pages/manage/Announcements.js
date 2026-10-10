import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EnvelopeSimple, Megaphone, PaperPlaneTilt, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { announcementsApi, eventsApi } from '../../api/endpoints';
import { useIdempotencyKey } from '../../hooks';
import { Card, PageHeader, Segmented } from '../../components/layout';
import { Alert, EmptyState, LoadingState, QueryState, StatusBadge, ProgressBar } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Checkbox, Field, Input, Select, Textarea, useForm } from '../../components/forms';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { AnnouncementItem } from '../../components/cards';
import { useToast } from '../../components/Toast';
import { LABELS } from '../../utils/status';
import { formatDateTime } from '../../utils/dates';
import { errorMessage } from '../../utils/errorMessages';

const EMPTY = { title: '', body: '', category: 'GENERAL', audience: 'PUBLIC', sendEmail: true, eventId: '' };

function Composer({ open, onClose, clubId, draft }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm(EMPTY);
  const events = useQuery({ queryKey: ['events', 'club', clubId, 'all'], queryFn: () => eventsApi.clubEvents(clubId, { all: true }), enabled: open });
  useEffect(() => {
    if (open) {
      form.setErrors({});
      form.setValues(draft ? { title: draft.title, body: draft.body, category: draft.category, audience: draft.audience, sendEmail: draft.sendEmail, eventId: draft.eventId || '' } : EMPTY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);
  const save = useMutation({
    mutationFn: (body) => (draft ? announcementsApi.update(draft.id, body) : announcementsApi.create(clubId, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Draft saved', 'Review it, then publish when ready.');
      onClose();
    },
    onError: (e) => form.applyServerErrors(e),
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.validate({ title: (v) => (!v?.trim() ? 'Enter a title.' : v.length > 150 ? 'Max 150 characters.' : null), body: (v) => (!v?.trim() ? 'Write the message.' : v.length > 5000 ? 'Max 5,000 characters.' : null) })) return;
    save.mutate({ ...form.values, eventId: form.values.eventId || null });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      title={draft ? 'Edit draft' : 'New announcement'}
      description="Saved as a draft. Publishing creates a permanent record of what was said, by whom and when."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="ann-form" loading={save.isPending}>Save draft</Button></>}
    >
      <form id="ann-form" className="form-grid" onSubmit={submit} noValidate>
        {save.isError && !Object.keys(save.error.details?.fields || {}).length && <div className="full"><Alert tone="danger">{errorMessage(save.error)}</Alert></div>}
        <Field label="Title" error={form.errors.title} required className="full" hint={`${form.values.title.length}/150`}>
          <Input maxLength={150} {...form.bind('title')} />
        </Field>
        <Field label="Category" required>
          <Select {...form.bind('category')} options={Object.entries(LABELS.category).map(([value, l]) => ({ value, label: l }))} />
        </Field>
        <Field label="Who can see it" required>
          <Select {...form.bind('audience')} options={[{ value: 'PUBLIC', label: 'Everyone (public)' }, { value: 'MEMBERS', label: 'Members & club team only' }]} />
        </Field>
        <Field label="Related event" hint="Ticket holders of the event are added to the mailing list." className="full">
          <Select {...form.bind('eventId')} placeholder="None" options={(events.data || []).filter((e) => ['PUBLISHED', 'DRAFT'].includes(e.status)).map((e) => ({ value: e.id, label: e.title }))} />
        </Field>
        <Field label="Message" error={form.errors.body} required className="full" hint="Plain text. Line breaks are kept.">
          <Textarea rows={7} maxLength={5000} {...form.bind('body')} />
        </Field>
        <div className="full">
          <Checkbox {...form.bind('sendEmail', { type: 'checkbox' })} label="Email the mailing list when published" hint="Active members of the club, plus ticket holders if an event is linked." />
        </div>
      </form>
    </Modal>
  );
}

function Deliveries({ announcement, onClose }) {
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['deliveries', announcement?.id, status], queryFn: () => announcementsApi.deliveries(announcement.id, { status }), enabled: !!announcement });
  return (
    <Modal open={!!announcement} onClose={onClose} width={720} title="Delivery report" description={announcement?.title}>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <Alert tone="danger">{errorMessage(q.error)}</Alert>
      ) : (
        <div className="stack">
          <div className="grid grid-4">
            {['SENT', 'PENDING', 'FAILED', 'SKIPPED'].map((s) => (
              <div key={s} className="card card-body stat">
                <span className="stat-label"><StatusBadge status={s} /></span>
                <span className="stat-value">{q.data.counts[s] || 0}</span>
              </div>
            ))}
          </div>
          <ProgressBar value={q.data.counts.SENT || 0} max={q.data.total || 1} label={`${q.data.counts.SENT || 0} of ${q.data.total} delivered`} tone="success" />
          <Segmented label="Filter deliveries" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'SENT', label: 'Sent' }, { value: 'FAILED', label: 'Failed' }, { value: 'SKIPPED', label: 'Skipped' }]} />
          <div className="card card-flush" style={{ maxHeight: 360, overflow: 'auto' }}>
            <DataTable
              caption="Deliveries"
              rows={q.data.rows}
              empty={<EmptyState icon={EnvelopeSimple} title="No deliveries in this view" />}
              columns={[
                { key: 'recipientName', header: 'Recipient', sortable: true },
                { key: 'channel', header: 'Channel' },
                { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
                { key: 'lastError', header: 'Detail', render: (d) => <span className="subtle">{d.lastError || `${d.attempts} attempt${d.attempts === 1 ? '' : 's'}`}</span> },
              ]}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Announcements() {
  const { clubId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [getKey, renewKey] = useIdempotencyKey();
  const [view, setView] = useState('all');
  const [editing, setEditing] = useState(undefined);
  const [publishing, setPublishing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [report, setReport] = useState(null);
  const list = useQuery({ queryKey: ['announcements', 'manage', clubId], queryFn: () => announcementsApi.clubList(clubId) });

  const publish = useMutation({
    mutationFn: (id) => announcementsApi.publish(id, getKey()),
    onSuccess: (r) => {
      renewKey();
      qc.invalidateQueries({ queryKey: ['announcements'] });
      setPublishing(null);
      toast.success('Published', r.recipientsQueued ? `Queued for ${r.recipientsQueued} recipients.` : 'Visible on the club page.');
    },
    onError: (e) => {
      renewKey();
      setPublishing(null);
      toast.error(e);
    },
  });
  const remove = useMutation({
    mutationFn: (id) => announcementsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      setDeleting(null);
      toast.success('Draft deleted');
    },
    onError: (e) => toast.error(e),
  });

  const filtered = (rows) => rows.filter((a) => view === 'all' || a.status === view);
  return (
    <>
      <PageHeader title="Announcements" description="Write once, deliver to the whole mailing list and keep a permanent record." actions={<Button variant="primary" icon={Plus} onClick={() => setEditing(null)}>New announcement</Button>} />
      <Card flush>
        <div className="toolbar">
          <Segmented label="Filter" value={view} onChange={setView} options={[{ value: 'all', label: 'All' }, { value: 'DRAFT', label: 'Drafts' }, { value: 'PUBLISHED', label: 'Published' }]} />
        </div>
        <QueryState query={list} isEmpty={(rows) => !filtered(rows).length} empty={<EmptyState icon={Megaphone} title="Nothing here yet" action={<Button onClick={() => setEditing(null)}>Write an announcement</Button>} />}>
          {(rows) => (
            <ul className="list">
              {filtered(rows).map((a) => (
                <li key={a.id} style={{ padding: 'var(--space-5)' }}>
                  <AnnouncementItem
                    a={a}
                    showClub={false}
                    actions={
                      <div className="actions">
                        {a.status === 'DRAFT' ? (
                          <>
                            <Button size="sm" variant="ghost" icon={Trash} onClick={() => setDeleting(a)} aria-label={`Delete draft ${a.title}`}>Delete</Button>
                            <Button size="sm" icon={PencilSimple} onClick={() => setEditing(a)}>Edit</Button>
                            <Button size="sm" variant="primary" icon={PaperPlaneTilt} onClick={() => setPublishing(a)}>Publish</Button>
                          </>
                        ) : (
                          a.sendEmail && (
                            <Button size="sm" icon={EnvelopeSimple} onClick={() => setReport(a)}>
                              {a.deliveryCounts.SENT || 0}/{a.deliveryCounts.total} delivered
                            </Button>
                          )
                        )}
                      </div>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Card>
      <Composer open={editing !== undefined} onClose={() => setEditing(undefined)} clubId={clubId} draft={editing} />
      <Deliveries announcement={report} onClose={() => setReport(null)} />
      <ConfirmDialog open={!!publishing} onClose={() => setPublishing(null)} onConfirm={() => publish.mutate(publishing.id)} loading={publish.isPending} title="Publish announcement?" confirmLabel="Publish now">
        <strong>{publishing?.title}</strong> will be visible to {publishing?.audience === 'MEMBERS' ? 'members and the club team' : 'everyone'}
        {publishing?.sendEmail ? ' and emailed to the mailing list' : ''}. Published announcements cannot be edited, so post a correction if something changes. Recorded as published {formatDateTime(new Date().toISOString())}.
      </ConfirmDialog>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting.id)} loading={remove.isPending} tone="danger" title="Delete this draft?" confirmLabel="Delete draft">
        “{deleting?.title}” will be removed. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
