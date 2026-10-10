import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from '@phosphor-icons/react';
import { eventsApi, financeApi, fundraisersApi } from '../api/endpoints';
import { useIdempotencyKey } from '../hooks';
import { Modal } from './Modal';
import { Button } from './Button';
import { Field, Input, MoneyInput, Select, Textarea, required, useForm } from './forms';
import { Alert, Badge } from './feedback';
import { useToast } from './Toast';
import { rupeesToPaise } from '../utils/money';
import { todayInput } from '../utils/dates';
import { errorMessage } from '../utils/errorMessages';

const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX = 5 * 1024 * 1024;

/**
 * Reimbursement request (any team member) or direct expense (treasurer).
 * Sends multipart form data with the receipt (LLD §4.9).
 */
export function ExpenseForm({ open, onClose, clubs, defaultClubId, allowDirect }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [getKey, renewKey] = useIdempotencyKey();
  const [file, setFile] = useState(null);
  const form = useForm({ clubId: defaultClubId || clubs[0]?.id || '', kind: 'REIMBURSEMENT', title: '', description: '', amount: '', incurredOn: todayInput(), link: '', payoutReference: '' });
  const clubId = form.values.clubId;

  useEffect(() => {
    if (open) {
      form.reset();
      form.setErrors({});
      setFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const events = useQuery({ queryKey: ['events', 'club', clubId, 'all'], queryFn: () => eventsApi.clubEvents(clubId, { all: true }), enabled: open && !!clubId });
  const funds = useQuery({ queryKey: ['fundraisers', clubId], queryFn: () => fundraisersApi.list(clubId), enabled: open && !!clubId, retry: false });

  const submit = useMutation({
    mutationFn: (fd) => financeApi.submitExpense(clubId, fd, getKey()),
    onSuccess: (e) => {
      renewKey();
      ['expenses', 'finance', 'transactions', 'budgets'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(e.kind === 'DIRECT' ? 'Expense recorded' : 'Claim submitted', e.kind === 'DIRECT' ? 'It now appears in the ledger.' : 'The treasurer will review it.');
      onClose();
    },
    onError: (e) => {
      renewKey();
      form.applyServerErrors(e);
    },
  });

  const onSubmit = (e) => {
    e.preventDefault();
    const ok = form.validate({
      title: required('Describe what the expense was for.'),
      amount: (v) => (rupeesToPaise(v) ? null : 'Enter an amount like 450 or 450.50.'),
      incurredOn: required('Enter the date.'),
    });
    let fileErr = null;
    if (!file) fileErr = 'Attach a receipt.';
    else if (!ALLOWED.includes(file.type)) fileErr = 'Use a JPEG, PNG or PDF file.';
    else if (file.size > MAX) fileErr = 'Receipts must be 5 MB or smaller.';
    if (fileErr) form.setErrors((x) => ({ ...x, receipt: fileErr }));
    if (!ok || fileErr) return;
    const v = form.values;
    const fd = new FormData();
    fd.append('kind', v.kind);
    fd.append('title', v.title);
    fd.append('description', v.description);
    fd.append('amountPaise', String(rupeesToPaise(v.amount)));
    fd.append('incurredOn', v.incurredOn);
    if (v.link.startsWith('evt:')) fd.append('eventId', v.link.slice(4));
    if (v.link.startsWith('fnd:')) fd.append('fundraiserId', v.link.slice(4));
    if (v.kind === 'DIRECT' && v.payoutReference) fd.append('payoutReference', v.payoutReference);
    fd.append('receipt', file);
    submit.mutate(fd);
  };

  const linkOptions = [
    ...(events.data || []).filter((e) => e.status !== 'CANCELLED').map((e) => ({ value: `evt:${e.id}`, label: `Event · ${e.title}` })),
    ...(funds.data || []).map((f) => ({ value: `fnd:${f.id}`, label: `Fundraiser · ${f.name}` })),
  ];
  const isDirect = form.values.kind === 'DIRECT';

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      title={isDirect ? 'Record a direct expense' : 'Request reimbursement'}
      description={isDirect ? 'Money already paid from club funds. Posts to the ledger immediately.' : 'Submit what you spent from your own pocket. Nothing is paid until it is approved and paid out.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="expense-form" loading={submit.isPending}>
            {isDirect ? 'Record expense' : 'Submit claim'}
          </Button>
        </>
      }
    >
      <form id="expense-form" className="stack" onSubmit={onSubmit} noValidate>
        {submit.isError && !Object.keys(submit.error.details?.fields || {}).length && <Alert tone="danger">{errorMessage(submit.error)}</Alert>}
        <div className="form-grid">
          {clubs.length > 1 && (
            <Field label="Club" required>
              <Select {...form.bind('clubId')} options={clubs.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
          )}
          {allowDirect && (
            <Field label="Type" required>
              <Select {...form.bind('kind')} options={[{ value: 'REIMBURSEMENT', label: 'Reimbursement claim' }, { value: 'DIRECT', label: 'Direct expense (treasurer)' }]} />
            </Field>
          )}
          <Field label="What was it for?" error={form.errors.title} required className="full">
            <Input placeholder="e.g. Poster printing for Tech Fest" {...form.bind('title')} />
          </Field>
          <Field label="Amount" error={form.errors.amount} required>
            <MoneyInput {...form.bind('amount')} />
          </Field>
          <Field label="Date of expense" error={form.errors.incurredOn} required>
            <Input type="date" max={todayInput()} {...form.bind('incurredOn')} />
          </Field>
          <Field label="Related to" hint="Optional. Links the cost to an event or fundraiser report." className="full">
            <Select {...form.bind('link')} placeholder="Nothing specific" options={linkOptions} />
          </Field>
          <Field label="Notes" className="full">
            <Textarea rows={2} {...form.bind('description')} />
          </Field>
          {isDirect && (
            <Field label="Payment reference" hint="UPI / bank reference for the payment." className="full">
              <Input className="input mono" {...form.bind('payoutReference')} />
            </Field>
          )}
          <Field label="Receipt" error={form.errors.receipt} required hint="JPEG, PNG or PDF, up to 5 MB." className="full">
            <input
              type="file"
              name="receipt"
              accept="image/jpeg,image/png,application/pdf"
              className="input"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                form.setErrors((x) => ({ ...x, receipt: undefined }));
              }}
            />
          </Field>
          {file && (
            <div className="row full">
              <Paperclip size={16} aria-hidden />
              <span className="wrap-anywhere">{file.name}</span>
              <Badge dot={false}>{Math.round(file.size / 1024)} KB</Badge>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
