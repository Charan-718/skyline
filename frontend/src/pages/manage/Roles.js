import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, UsersThree } from '@phosphor-icons/react';
import { clubsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Card, PageHeader } from '../../components/layout';
import { Alert, Badge, EmptyState, QueryState } from '../../components/feedback';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { Field, Input, Select, required, useForm } from '../../components/forms';
import { ConfirmDialog } from '../../components/Modal';
import { Avatar } from '../../components/domain';
import { useToast } from '../../components/Toast';
import { formatDate } from '../../utils/dates';
import { LABELS } from '../../utils/status';
import { errorMessage } from '../../utils/errorMessages';

const ROLE_HELP = {
  CLUB_HEAD: 'Full control: events, plans, merch, announcements, roles.',
  TREASURER: 'Budgets, expenses, reimbursements, income and ledger.',
  VOLUNTEER: 'Fundraiser tasks, event check-in when assigned, reimbursement claims.',
};

export default function Roles() {
  const { clubId } = useParams();
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [revoking, setRevoking] = useState(null);
  const roles = useQuery({ queryKey: ['roles', clubId], queryFn: () => clubsApi.roles(clubId) });
  const form = useForm({ userEmail: '', role: 'VOLUNTEER' });
  const assign = useMutation({
    mutationFn: (body) => clubsApi.assignRole(clubId, body),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['roles', clubId] });
      form.reset();
      toast.success('Role assigned', `${r.fullName} is now ${LABELS.role[r.role].toLowerCase()}.`);
    },
    onError: (e) => form.applyServerErrors(e),
  });
  const revoke = useMutation({
    mutationFn: (id) => clubsApi.revokeRole(clubId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles', clubId] });
      setRevoking(null);
      refresh();
      toast.success('Role removed');
    },
    onError: (e) => {
      setRevoking(null);
      toast.error(e);
    },
  });
  return (
    <>
      <PageHeader title="Team & roles" description="People can hold several roles. Every change is recorded in the audit log." />
      <div className="grid grid-main-side">
        <Card title="Current team" flush>
          <QueryState query={roles} empty={<EmptyState icon={UsersThree} title="No roles assigned" />}>
            {(rows) => (
              <DataTable
                caption="Club role assignments"
                rows={rows}
                initialSort={{ key: 'role', dir: 'asc' }}
                columns={[
                  { key: 'fullName', header: 'Person', sortable: true, render: (r) => <div className="row" style={{ flexWrap: 'nowrap' }}><Avatar name={r.fullName} /><div><div className="cell-title">{r.fullName}{r.userId === user.id && ' (you)'}</div><div className="cell-sub wrap-anywhere">{r.email}</div></div></div> },
                  { key: 'role', header: 'Role', sortable: true, render: (r) => <Badge tone={r.role === 'CLUB_HEAD' ? 'primary' : r.role === 'TREASURER' ? 'accent' : 'info'} dot={false}>{LABELS.role[r.role]}</Badge> },
                  { key: 'assignedAt', header: 'Since', render: (r) => formatDate(r.assignedAt), hideOnMobile: true },
                  { key: 'act', header: <span className="sr-only">Actions</span>, align: 'right', render: (r) => <Button size="sm" variant="ghost" onClick={() => setRevoking(r)}>Remove</Button> },
                ]}
              />
            )}
          </QueryState>
        </Card>
        <Card title="Assign a role" description="The person must already have an account.">
          <form
            className="stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (form.validate({ userEmail: required('Enter their email.') })) assign.mutate(form.values);
            }}
          >
            {assign.isError && !Object.keys(assign.error.details?.fields || {}).length && <Alert tone="danger">{errorMessage(assign.error)}</Alert>}
            <Field label="Email" error={form.errors.userEmail} required>
              <Input type="email" inputMode="email" {...form.bind('userEmail')} />
            </Field>
            <Field label="Role" hint={ROLE_HELP[form.values.role]} required>
              <Select {...form.bind('role')} options={Object.entries(LABELS.role).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Button type="submit" variant="primary" icon={UserPlus} loading={assign.isPending}>
              Assign role
            </Button>
          </form>
        </Card>
      </div>
      <ConfirmDialog open={!!revoking} onClose={() => setRevoking(null)} onConfirm={() => revoke.mutate(revoking.id)} loading={revoke.isPending} tone="danger" title="Remove this role?" confirmLabel="Remove role">
        {revoking && <>{revoking.fullName} will lose {LABELS.role[revoking.role].toLowerCase()} access to this club. {revoking.userId === user.id && <strong>This is your own role.</strong>}</>}
      </ConfirmDialog>
    </>
  );
}
