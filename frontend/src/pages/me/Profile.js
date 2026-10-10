import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IdentificationCard } from '@phosphor-icons/react';
import { authApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Card, PageHeader } from '../../components/layout';
import { Alert, QueryState, StatusBadge } from '../../components/feedback';
import { Field, Input, required, useForm } from '../../components/forms';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { formatDateTime } from '../../utils/dates';
import { errorMessage } from '../../utils/errorMessages';
import { IS_DEMO } from '../../api/config';

function ProfileForm() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const form = useForm({ fullName: user.fullName, phoneE164: user.phoneE164 || '' });
  const save = useMutation({
    mutationFn: (body) => authApi.updateProfile(body),
    onSuccess: () => {
      refresh();
      toast.success('Profile saved');
    },
    onError: (e) => form.applyServerErrors(e),
  });
  return (
    <Card title="Profile" description="Your name appears on tickets and your membership card.">
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (form.validate({ fullName: required('Enter your name.'), phoneE164: (v) => (v && !/^\+[1-9]\d{7,14}$/.test(v) ? 'Use international format, e.g. +919876543210.' : null) })) save.mutate({ fullName: form.values.fullName, phoneE164: form.values.phoneE164 || null });
        }}
      >
        <Field label="Email" hint="Email changes are not supported.">
          <Input value={user.email} disabled readOnly />
        </Field>
        <Field label="Full name" error={form.errors.fullName} required>
          <Input autoComplete="name" {...form.bind('fullName')} />
        </Field>
        <Field label="Mobile" hint="Optional." error={form.errors.phoneE164}>
          <Input type="tel" autoComplete="tel" placeholder="+919876543210" {...form.bind('phoneE164')} />
        </Field>
        <div>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Verification() {
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const status = useQuery({ queryKey: ['verification'], queryFn: () => authApi.getVerification() });
  const form = useForm({ studentIdentifier: '', fullName: user.fullName });
  const verify = useMutation({
    mutationFn: (body) => authApi.verify(body),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['verification'] });
      refresh();
      if (r.outcome === 'VERIFIED') toast.success('You are verified', 'Membership plans are now available to you.');
      else toast.warning('Not verified', 'The college records did not match. Check your student ID and name.');
    },
    onError: (e) => form.applyServerErrors(e),
  });
  return (
    <Card title="College student verification" description="Checked against the college student database. Your student ID is never stored in plain text.">
      <QueryState query={status}>
        {(s) => (
          <div className="stack">
            <div className="row">
              <StatusBadge status={s.status} />
              {s.checkedAt && <span className="subtle">Last checked {formatDateTime(s.checkedAt)}</span>}
            </div>
            {verify.isError && !Object.keys(verify.error.details?.fields || {}).length && (
              <Alert tone={verify.error.code === 'VERIFICATION_UNAVAILABLE' ? 'warning' : 'danger'}>{errorMessage(verify.error)}</Alert>
            )}
            {s.status !== 'VERIFIED' && (
              <form
                className="stack"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (form.validate({ studentIdentifier: required('Enter your student ID.'), fullName: required('Enter your name as on college records.') })) verify.mutate(form.values);
                }}
              >
                <Field label="Student ID" error={form.errors.studentIdentifier} required hint={IS_DEMO ? 'Demo: SKY2024EC017 + Priya Nair, or MOCK-UNAVAILABLE. Live: GET /dev/college-roster for roll IDs.' : 'Use your roll number as on college records.'}>
                  <Input autoComplete="off" className="input mono" {...form.bind('studentIdentifier')} />
                </Field>
                <Field label="Full name (as on college records)" error={form.errors.fullName} required>
                  <Input {...form.bind('fullName')} />
                </Field>
                <div>
                  <Button type="submit" variant="primary" icon={IdentificationCard} loading={verify.isPending}>
                    Verify
                  </Button>
                </div>
              </form>
            )}
            {s.status === 'VERIFIED' && <p className="muted">You can join clubs and buy membership plans.</p>}
          </div>
        )}
      </QueryState>
    </Card>
  );
}

export default function Profile() {
  return (
    <>
      <PageHeader title="Profile & verification" description="Manage your details and confirm you are a college student." />
      <div className="grid grid-2">
        <ProfileForm />
        <Verification />
      </div>
    </>
  );
}
