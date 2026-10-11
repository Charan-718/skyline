import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotePencil, RocketLaunch, Sparkle } from '@phosphor-icons/react';
import { clubsApi, eventsApi, membershipsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Card, PageHeader, Tabs } from '../../components/layout';
import { Alert } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Checkbox, Field, Select } from '../../components/forms';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../utils/errorMessages';
import { EventForm } from './EventForm';
import { AgentChat, DraftSummary, useAgentAvailable, useAgentConversation } from './EventAgent';

const EXAMPLES = [
  'Photo walk tomorrow 5–7 pm at the lake, 30 people, free for members, ₹50 for others',
  'Portfolio review next Saturday 10 am to 1 pm in the design lab, 40 seats, ₹100 for everyone',
];

/** Organizer choices for publishing: club role holders and active members; the current user first. */
function useOrganizerOptions(clubId, me) {
  const roles = useQuery({ queryKey: ['roles', clubId], queryFn: () => clubsApi.roles(clubId) });
  const members = useQuery({ queryKey: ['members', clubId, 'picker'], queryFn: () => membershipsApi.clubMembers(clubId, { status: 'ACTIVE', pageSize: 100 }) });
  const people = new Map();
  if (me) people.set(me.id, `${me.fullName} (you)`);
  (roles.data || []).forEach((r) => !people.has(r.userId) && people.set(r.userId, r.fullName));
  (members.data?.data || []).forEach((m) => !people.has(m.userId) && people.set(m.userId, m.fullName));
  return [...people].map(([value, label]) => ({ value, label }));
}

function AgentCreate({ clubId, onReview }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const convo = useAgentConversation((body) => eventsApi.agentCreateTurn(clubId, body), 'create');
  const [publish, setPublish] = useState(null);
  const [organizerId, setOrganizerId] = useState(user?.id || '');
  const organizerOptions = useOrganizerOptions(clubId, user);
  const ready = convo.last?.status === 'READY';
  const publishNow = publish ?? Boolean(convo.last?.publishRequested);

  const commit = useMutation({
    mutationFn: async () => {
      const event = await eventsApi.create(clubId, convo.value);
      if (!publishNow) return { event, published: false };
      try {
        await eventsApi.setOrganizers(event.id, [organizerId]);
        await eventsApi.publish(event.id);
        return { event, published: true };
      } catch (publishError) {
        return { event, published: false, publishError };
      }
    },
    onSuccess: ({ event, published, publishError }) => {
      qc.invalidateQueries({ queryKey: ['events'] });
      if (published) toast.success('Event published', 'Students can see it and book once registration opens.');
      else if (publishError) toast.warning('Saved as a draft', `It could not be published: ${errorMessage(publishError)}`);
      else toast.success('Draft created', 'Assign an organizer, then publish to open bookings.');
      navigate(`/manage/events/${event.id}${published ? '' : '?tab=team'}`);
    },
  });

  return (
    <div className="agent-layout">
      <Card title="Describe your event" className="agent-chat-card">
        <AgentChat convo={convo} examples={EXAMPLES} placeholder="e.g. Quiz night this Friday 6–8 pm in Hall 2, 80 seats, ₹50 for members, ₹80 for others" />
      </Card>
      <Card title="Draft so far" description="Every value shows where it came from. Nothing is saved until you confirm.">
        <div className="stack">
          <DraftSummary draft={convo.value} sources={convo.sources} />
          {ready && (
            <div className="stack-sm agent-commit">
              <Checkbox checked={publishNow} onChange={(e) => setPublish(e.target.checked)} label="Publish now" hint="Students see it immediately and can book once registration opens." />
              {publishNow && (
                <Field label="Organizer" hint="At least one organizer is required to publish.">
                  <Select value={organizerId} onChange={(e) => setOrganizerId(e.target.value)} options={organizerOptions} placeholder="Choose an organizer" />
                </Field>
              )}
              {commit.error && <Alert tone="danger">{errorMessage(commit.error)}</Alert>}
              <div className="actions" style={{ justifyContent: 'flex-end' }}>
                <Button icon={NotePencil} onClick={() => onReview(convo.value)}>Review in form</Button>
                <Button variant="primary" icon={publishNow ? RocketLaunch : undefined} loading={commit.isPending} disabled={publishNow && !organizerId} onClick={() => commit.mutate()}>
                  {publishNow ? 'Create and publish' : 'Save draft'}
                </Button>
              </div>
            </div>
          )}
          {!ready && convo.messages.length > 0 && (
            <Button icon={NotePencil} onClick={() => onReview(convo.value)}>Continue manually with these details</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function EventEditor() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const agentAvailable = useAgentAvailable();
  const [mode, setMode] = useState('manual');
  const [prefill, setPrefill] = useState(null);
  const create = useMutation({
    mutationFn: (body) => eventsApi.create(clubId, body),
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: ['events'] });
      toast.success('Draft created', 'Assign an organizer, then publish to open bookings.');
      navigate(`/manage/events/${e.id}?tab=team`);
    },
  });
  const manual = mode === 'manual' || !agentAvailable;
  return (
    <div style={{ maxWidth: manual ? 880 : 1200 }}>
      <PageHeader
        breadcrumbs={[{ label: 'Events', to: `/manage/${clubId}/events` }, { label: 'New event' }]}
        title="Create event"
        description={manual ? 'Saved as a draft. Nothing is visible to students until you publish.' : 'Tell the agent about the event. It asks for anything missing and never guesses.'}
        actions={
          manual && (
            <>
              <Button to={`/manage/${clubId}/events`}>Cancel</Button>
              <Button variant="primary" type="submit" form="event-form" loading={create.isPending}>
                Save draft
              </Button>
            </>
          )
        }
      />
      {agentAvailable && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Tabs
            label="How to create the event"
            value={manual ? 'manual' : 'agent'}
            onChange={setMode}
            tabs={[
              { value: 'manual', label: 'Manual', icon: NotePencil },
              { value: 'agent', label: 'AI agent', icon: Sparkle },
            ]}
          />
        </div>
      )}
      {/* The agent stays mounted while you switch tabs, so the conversation is not lost. */}
      {agentAvailable && (
        <div hidden={manual}>
          <AgentCreate
            clubId={clubId}
            onReview={(draft) => {
              setPrefill({ ...draft, _v: Date.now() });
              setMode('manual');
            }}
          />
        </div>
      )}
      {manual && (
        <>
          {prefill && <Alert tone="info">Filled in from the agent. Check every field, then save.</Alert>}
          <div className="card card-body" style={{ marginTop: prefill ? 'var(--space-4)' : 0 }}>
            <EventForm key={prefill?._v ?? 'blank'} event={prefill} onSubmit={(b) => create.mutate(b)} submitting={create.isPending} error={create.error} />
          </div>
          <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
            <Button variant="primary" type="submit" form="event-form" loading={create.isPending}>
              Save draft
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
