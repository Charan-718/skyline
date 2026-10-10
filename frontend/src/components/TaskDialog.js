import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fundraisersApi } from '../api/endpoints';
import { Modal } from './Modal';
import { Button } from './Button';
import { Field, Input, Select, Textarea, required, useForm } from './forms';
import { Alert, StatusBadge } from './feedback';
import { useToast } from './Toast';
import { fromLocalInput, toLocalInput, formatDateTime } from '../utils/dates';
import { errorMessage } from '../utils/errorMessages';

const STATUS_OPTIONS = { TODO: ['TODO', 'IN_PROGRESS', 'DONE'], IN_PROGRESS: ['IN_PROGRESS', 'DONE'], DONE: ['DONE'], CANCELLED: ['CANCELLED'] };
const NAMES = { TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done', CANCELLED: 'Cancelled' };

/** Create (club head) or update a fundraiser task. Assignees can change only status and progress. */
export function TaskDialog({ open, onClose, task, fundraiserId, isHead, assignees = [] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const creating = !task;
  const form = useForm({});

  useEffect(() => {
    if (open) {
      form.setValues({
        title: task?.title || '',
        description: task?.description || '',
        assigneeUserId: task?.assigneeUserId || '',
        deadline: toLocalInput(task?.deadline),
        status: task?.status || 'TODO',
        progressPercent: task?.progressPercent ?? 0,
      });
      form.setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  const save = useMutation({
    mutationFn: (body) => (creating ? fundraisersApi.createTask(fundraiserId, body) : fundraisersApi.updateTask(task.id, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fundraiser'] });
      qc.invalidateQueries({ queryKey: ['fundraisers'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(creating ? 'Task created' : 'Task updated');
      onClose();
    },
    onError: (e) => form.applyServerErrors(e),
  });

  const submit = (e) => {
    e.preventDefault();
    const v = form.values;
    if (isHead && !form.validate({ title: required('Enter a title.'), deadline: required('Set a deadline.') })) return;
    const body = creating
      ? { title: v.title, description: v.description, assigneeUserId: v.assigneeUserId || null, deadline: fromLocalInput(v.deadline) }
      : {
          status: v.status !== task.status ? v.status : undefined,
          progressPercent: v.status === 'DONE' ? undefined : Number(v.progressPercent),
          ...(isHead ? { title: v.title, description: v.description, assigneeUserId: v.assigneeUserId || null, deadline: fromLocalInput(v.deadline) } : {}),
        };
    save.mutate(body);
  };

  const statusOptions = task ? [...new Set([...(STATUS_OPTIONS[task.status] || [task.status]), ...(isHead && task.status === 'DONE' ? ['IN_PROGRESS'] : []), ...(isHead && task.status !== 'DONE' ? ['CANCELLED'] : [])])] : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={creating ? 'New task' : task.title}
      description={creating ? 'Assign work to a club volunteer, treasurer or head.' : task.fundraiserName}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="task-form" loading={save.isPending}>
            {creating ? 'Create task' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="task-form" className="stack" onSubmit={submit} noValidate>
        {save.isError && !Object.keys(save.error.details?.fields || {}).length && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        {!creating && (
          <div className="row">
            <StatusBadge status={task.status} />
            {task.overdue && <StatusBadge status="OFF_TRACK" label="Overdue" />}
            <span className="subtle">Due {formatDateTime(task.deadline)}</span>
          </div>
        )}
        {isHead ? (
          <>
            <Field label="Title" error={form.errors.title} required>
              <Input {...form.bind('title')} />
            </Field>
            <Field label="Description">
              <Textarea rows={3} {...form.bind('description')} />
            </Field>
            <div className="form-grid">
              <Field label="Assignee" error={form.errors.assigneeUserId} hint="Only club role holders can be assigned.">
                <Select {...form.bind('assigneeUserId')} placeholder="Unassigned" options={assignees.map((a) => ({ value: a.userId, label: a.fullName }))} />
              </Field>
              <Field label="Deadline" error={form.errors.deadline} required>
                <Input type="datetime-local" {...form.bind('deadline')} />
              </Field>
            </div>
          </>
        ) : (
          task?.description && <p className="muted">{task.description}</p>
        )}
        {!creating && task.status !== 'CANCELLED' && (
          <div className="form-grid">
            <Field label="Status">
              <Select {...form.bind('status')} options={statusOptions.map((s) => ({ value: s, label: NAMES[s] }))} />
            </Field>
            <Field label={`Progress: ${form.values.status === 'DONE' ? 100 : form.values.progressPercent}%`}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={form.values.status === 'DONE'}
                value={form.values.status === 'DONE' ? 100 : form.values.progressPercent ?? 0}
                onChange={(e) => form.set('progressPercent', e.target.value)}
                style={{ accentColor: 'var(--color-primary)', minHeight: 40 }}
                aria-valuetext={`${form.values.progressPercent}%`}
              />
            </Field>
          </div>
        )}
      </form>
    </Modal>
  );
}
