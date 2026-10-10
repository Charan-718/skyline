import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi } from '../../api/endpoints';
import { PageHeader } from '../../components/layout';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { EventForm } from './EventForm';

export default function EventEditor() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: (body) => eventsApi.create(clubId, body),
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: ['events'] });
      toast.success('Draft created', 'Assign an organizer, then publish to open bookings.');
      navigate(`/manage/events/${e.id}?tab=team`);
    },
  });
  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader
        breadcrumbs={[{ label: 'Events', to: `/manage/${clubId}/events` }, { label: 'New event' }]}
        title="Create event"
        description="Saved as a draft. Nothing is visible to students until you publish."
        actions={
          <>
            <Button to={`/manage/${clubId}/events`}>Cancel</Button>
            <Button variant="primary" type="submit" form="event-form" loading={create.isPending}>
              Save draft
            </Button>
          </>
        }
      />
      <div className="card card-body">
        <EventForm onSubmit={(b) => create.mutate(b)} submitting={create.isPending} error={create.error} />
      </div>
      <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
        <Button variant="primary" type="submit" form="event-form" loading={create.isPending}>
          Save draft
        </Button>
      </div>
    </div>
  );
}
