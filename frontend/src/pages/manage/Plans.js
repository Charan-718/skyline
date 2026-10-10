import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, IdentificationBadge, PencilSimple, Plus } from '@phosphor-icons/react';
import { membershipsApi } from '../../api/endpoints';
import { PageHeader } from '../../components/layout';
import { Alert, EmptyState, LoadingState, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Checkbox, Field, Input, MoneyInput, Textarea, required, useForm } from '../../components/forms';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { Money } from '../../components/domain';
import { useToast } from '../../components/Toast';
import { paiseToRupeesInput, rupeesToPaise } from '../../utils/money';
import { errorMessage } from '../../utils/errorMessages';

const EMPTY = { name: '', description: '', benefitsText: '', fee: '', durationMonths: '12', eventDiscount: '0', merchDiscount: '0', earlyBirdAccess: false };

function PlanDialog({ open, onClose, clubId, plan }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm(EMPTY);
  useEffect(() => {
    if (!open) return;
    form.setErrors({});
    form.setValues(
      plan
        ? { name: plan.name, description: plan.description, benefitsText: plan.benefitsText, fee: paiseToRupeesInput(plan.feePaise), durationMonths: String(plan.durationMonths), eventDiscount: String(plan.eventDiscountBps / 100), merchDiscount: String(plan.merchDiscountBps / 100), earlyBirdAccess: plan.earlyBirdAccess }
        : EMPTY,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan]);
  const save = useMutation({
    mutationFn: (body) => (plan ? membershipsApi.updatePlan(plan.id, body) : membershipsApi.createPlan(clubId, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans', clubId] });
      toast.success(plan ? 'Plan updated' : 'Plan created', plan ? 'Changes apply to new purchases and renewals only.' : undefined);
      onClose();
    },
    onError: (e) => {
      const f = e.details?.fields || {};
      form.setErrors({ ...f, fee: f.feePaise, eventDiscount: f.eventDiscountBps, merchDiscount: f.merchDiscountBps });
    },
  });
  const pct = (v) => (v === '' || Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100 ? 'Enter 0–100.' : null);
  const submit = (e) => {
    e.preventDefault();
    const ok = form.validate({
      name: required('Enter a plan name.'),
      fee: (v) => (rupeesToPaise(v) == null ? 'Enter a fee (0 for free).' : null),
      durationMonths: (v) => (!/^\d+$/.test(v) || +v < 1 || +v > 24 ? 'Enter 1–24 months.' : null),
      eventDiscount: pct,
      merchDiscount: pct,
    });
    if (!ok) return;
    const v = form.values;
    save.mutate({ name: v.name, description: v.description, benefitsText: v.benefitsText, feePaise: rupeesToPaise(v.fee), durationMonths: +v.durationMonths, eventDiscountBps: Math.round(+v.eventDiscount * 100), merchDiscountBps: Math.round(+v.merchDiscount * 100), earlyBirdAccess: !!v.earlyBirdAccess });
  };
  return (
    <Modal open={open} onClose={onClose} width={620} title={plan ? `Edit ${plan.name}` : 'New membership plan'} description="Existing members keep the terms they paid for." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="plan-form" loading={save.isPending}>{plan ? 'Save plan' : 'Create plan'}</Button></>}>
      <form id="plan-form" className="form-grid" onSubmit={submit} noValidate>
        {save.isError && !Object.keys(save.error.details?.fields || {}).length && <div className="full"><Alert tone="danger">{errorMessage(save.error)}</Alert></div>}
        <Field label="Plan name" error={form.errors.name} required className="full">
          <Input {...form.bind('name')} />
        </Field>
        <Field label="Fee" error={form.errors.fee} required>
          <MoneyInput {...form.bind('fee')} />
        </Field>
        <Field label="Duration (months)" error={form.errors.durationMonths} required>
          <Input type="number" min={1} max={24} inputMode="numeric" {...form.bind('durationMonths')} />
        </Field>
        <Field label="Event ticket discount (%)" error={form.errors.eventDiscount} hint="Applied on top of the event's member price.">
          <Input type="number" min={0} max={100} step="0.5" inputMode="decimal" {...form.bind('eventDiscount')} />
        </Field>
        <Field label="Merchandise discount (%)" error={form.errors.merchDiscount}>
          <Input type="number" min={0} max={100} step="0.5" inputMode="decimal" {...form.bind('merchDiscount')} />
        </Field>
        <div className="full">
          <Checkbox {...form.bind('earlyBirdAccess', { type: 'checkbox' })} label="Early access to event registration" hint="Members can book from an event's early-access time." />
        </div>
        <Field label="Short description" className="full">
          <Input {...form.bind('description')} />
        </Field>
        <Field label="Benefits shown to students" hint="One benefit per line." className="full">
          <Textarea rows={3} {...form.bind('benefitsText')} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Plans() {
  const { clubId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(undefined);
  const [archiving, setArchiving] = useState(null);
  const plans = useQuery({ queryKey: ['plans', clubId, 'all'], queryFn: () => membershipsApi.plans(clubId, { includeArchived: true }) });
  const archive = useMutation({
    mutationFn: (id) => membershipsApi.archivePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans', clubId] });
      setArchiving(null);
      toast.success('Plan archived', 'It is no longer offered. Current members are unaffected.');
    },
    onError: (e) => toast.error(e),
  });
  return (
    <>
      <PageHeader title="Membership plans" description="Fees, durations and benefits offered to verified students." actions={<Button variant="primary" icon={Plus} onClick={() => setEditing(null)}>New plan</Button>} />
      <QueryState query={plans} loading={<LoadingState rows={6} />} empty={<div className="card"><EmptyState icon={IdentificationBadge} title="No plans yet" action={<Button variant="primary" onClick={() => setEditing(null)}>Create the first plan</Button>}>Students can't join until there is at least one plan.</EmptyState></div>}>
        {(list) => (
          <ol className="ruled">
            {list.map((p) => (
              <li key={p.id} style={p.status === 'ARCHIVED' ? { opacity: 0.7 } : undefined}>
                <div className="stack-sm">
                  <div className="row">
                    <h2 className="ruled-title">{p.name}</h2>
                    <StatusBadge status={p.status} />
                  </div>
                  {p.description && <p className="muted">{p.description}</p>}
                  <dl className="dl" style={{ marginTop: 'var(--space-2)' }}>
                    <dt>Fee</dt>
                    <dd>{p.feePaise ? <Money paise={p.feePaise} /> : 'Free'} for {p.durationMonths} months</dd>
                    <dt>Discounts</dt>
                    <dd>{p.eventDiscountBps / 100}% on tickets · {p.merchDiscountBps / 100}% on merchandise</dd>
                    <dt>Early access</dt>
                    <dd>{p.earlyBirdAccess ? 'Yes' : 'No'}</dd>
                    <dt>Active members</dt>
                    <dd className="num">{p.activeMembers}</dd>
                  </dl>
                </div>
                {p.status === 'ACTIVE' && (
                  <div className="actions">
                    <Button size="sm" icon={PencilSimple} onClick={() => setEditing(p)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={Archive} onClick={() => setArchiving(p)}>Archive</Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </QueryState>
      <PlanDialog open={editing !== undefined} onClose={() => setEditing(undefined)} clubId={clubId} plan={editing} />
      <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} onConfirm={() => archive.mutate(archiving.id)} loading={archive.isPending} tone="danger" title={`Archive ${archiving?.name}?`} confirmLabel="Archive plan">
        Students will no longer be able to join or renew into this plan. AutoPay renewals into it will be skipped. Existing memberships keep their benefits until expiry.
      </ConfirmDialog>
    </>
  );
}
