import { useEffect } from 'react';
import { Field, Input, MoneyInput, Textarea, Checkbox, required, useForm } from '../../components/forms';
import { Alert } from '../../components/feedback';
import { fromLocalInput, toLocalInput } from '../../utils/dates';
import { paiseToRupeesInput, rupeesToPaise } from '../../utils/money';
import { errorMessage } from '../../utils/errorMessages';

const toValues = (e) => ({
  title: e?.title || '',
  description: e?.description || '',
  venue: e?.venue || '',
  capacity: e?.capacity ? String(e.capacity) : '',
  memberPrice: paiseToRupeesInput(e?.memberPricePaise ?? null),
  membersOnly: e ? e.nonMemberPricePaise == null : false,
  nonMemberPrice: paiseToRupeesInput(e?.nonMemberPricePaise ?? null),
  memberDiscountEligible: e ? e.memberDiscountEligible : true,
  ebMember: paiseToRupeesInput(e?.earlyBirdMemberPricePaise ?? null),
  ebNonMember: paiseToRupeesInput(e?.earlyBirdNonMemberPricePaise ?? null),
  ebQuantity: e?.earlyBirdQuantity ? String(e.earlyBirdQuantity) : '',
  ebEndsAt: toLocalInput(e?.earlyBirdEndsAt),
  earlyAccessOpensAt: toLocalInput(e?.earlyAccessOpensAt),
  registrationOpensAt: toLocalInput(e?.registrationOpensAt),
  registrationClosesAt: toLocalInput(e?.registrationClosesAt),
  startsAt: toLocalInput(e?.startsAt),
  endsAt: toLocalInput(e?.endsAt),
});

const SERVER_TO_FORM = { memberPricePaise: 'memberPrice', nonMemberPricePaise: 'nonMemberPrice', earlyBirdEndsAt: 'ebEndsAt', earlyBirdMemberPricePaise: 'ebMember' };

/**
 * Event create/edit form. `restrictTo` limits editable fields (organizers: description + venue).
 * Pricing/eligibility rules are enforced by the API; this form only checks shape and date order.
 */
export function EventForm({ event, onSubmit, submitting, error, restrictTo, formId = 'event-form' }) {
  const form = useForm(toValues(event));
  useEffect(() => {
    if (error) {
      const f = error.details?.fields || {};
      form.setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [SERVER_TO_FORM[k] || k, v])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  const can = (k) => !restrictTo || restrictTo.includes(k);
  const money = (opt) => (v) => (opt && !v ? null : rupeesToPaise(v) == null ? 'Enter an amount like 150 or 150.50.' : null);

  const submit = (e) => {
    e.preventDefault();
    const v = form.values;
    const rules = restrictTo
      ? { venue: required('Enter a venue.') }
      : {
          title: required('Enter a title.'),
          venue: required('Enter a venue.'),
          capacity: (x) => (!/^\d+$/.test(x) || +x < 1 ? 'Enter a capacity of at least 1.' : null),
          memberPrice: money(false),
          nonMemberPrice: v.membersOnly ? () => null : money(false),
          ebMember: money(true),
          ebNonMember: money(true),
          registrationOpensAt: required('Required.'),
          registrationClosesAt: (x) => (!x ? 'Required.' : x <= v.registrationOpensAt ? 'Must be after registration opens.' : x > v.startsAt && v.startsAt ? 'Must close before the event starts.' : null),
          startsAt: required('Required.'),
          endsAt: (x) => (!x ? 'Required.' : x <= v.startsAt ? 'Must be after the start.' : null),
          ebEndsAt: (x) => ((v.ebMember || v.ebNonMember) && !x ? 'Set when early-bird pricing ends.' : null),
          earlyAccessOpensAt: (x) => (x && x >= v.registrationOpensAt ? 'Must be before general registration opens.' : null),
        };
    if (!form.validate(rules)) return;
    const opt = (x) => (x ? rupeesToPaise(x) : null);
    const body = restrictTo
      ? { description: v.description, venue: v.venue }
      : {
          title: v.title.trim(),
          description: v.description,
          venue: v.venue.trim(),
          capacity: +v.capacity,
          memberPricePaise: rupeesToPaise(v.memberPrice),
          nonMemberPricePaise: v.membersOnly ? null : rupeesToPaise(v.nonMemberPrice),
          memberDiscountEligible: !!v.memberDiscountEligible,
          earlyBirdMemberPricePaise: opt(v.ebMember),
          earlyBirdNonMemberPricePaise: v.membersOnly ? null : opt(v.ebNonMember),
          earlyBirdQuantity: v.ebQuantity ? +v.ebQuantity : null,
          earlyBirdEndsAt: fromLocalInput(v.ebEndsAt),
          earlyAccessOpensAt: fromLocalInput(v.earlyAccessOpensAt),
          registrationOpensAt: fromLocalInput(v.registrationOpensAt),
          registrationClosesAt: fromLocalInput(v.registrationClosesAt),
          startsAt: fromLocalInput(v.startsAt),
          endsAt: fromLocalInput(v.endsAt),
        };
    onSubmit(body);
  };

  const dis = (k) => ({ disabled: !can(k) || submitting });

  return (
    <form id={formId} className="stack-lg" onSubmit={submit} noValidate>
      {error && !Object.keys(error.details?.fields || {}).length && <Alert tone="danger">{errorMessage(error)}</Alert>}
      {restrictTo && <Alert tone="info">As an organizer you can update the description and venue. Pricing, capacity and dates are managed by the club head.</Alert>}
      <fieldset className="fieldset">
        <legend>Basics</legend>
        <div className="form-grid">
          <Field label="Title" error={form.errors.title} required className="full">
            <Input {...form.bind('title')} {...dis('title')} />
          </Field>
          <Field label="Description" className="full">
            <Textarea rows={4} {...form.bind('description')} {...dis('description')} />
          </Field>
          <Field label="Venue" error={form.errors.venue} required>
            <Input {...form.bind('venue')} {...dis('venue')} />
          </Field>
          <Field label="Capacity" error={form.errors.capacity} required hint={event ? `${event.seatsReserved} seats already sold or held.` : undefined}>
            <Input type="number" min={1} inputMode="numeric" {...form.bind('capacity')} {...dis('capacity')} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend>Schedule</legend>
        <div className="form-grid">
          <Field label="Starts" error={form.errors.startsAt} required>
            <Input type="datetime-local" {...form.bind('startsAt')} {...dis('startsAt')} />
          </Field>
          <Field label="Ends" error={form.errors.endsAt} required>
            <Input type="datetime-local" {...form.bind('endsAt')} {...dis('endsAt')} />
          </Field>
          <Field label="Registration opens" error={form.errors.registrationOpensAt} required>
            <Input type="datetime-local" {...form.bind('registrationOpensAt')} {...dis('registrationOpensAt')} />
          </Field>
          <Field label="Registration closes" error={form.errors.registrationClosesAt} required>
            <Input type="datetime-local" {...form.bind('registrationClosesAt')} {...dis('registrationClosesAt')} />
          </Field>
          <Field label="Member early access opens" error={form.errors.earlyAccessOpensAt} hint="Optional. Members whose plan includes early access can book from this time." className="full">
            <Input type="datetime-local" {...form.bind('earlyAccessOpensAt')} {...dis('earlyAccessOpensAt')} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend>Pricing</legend>
        <div className="form-grid">
          <Field label="Member price" error={form.errors.memberPrice} required hint="0 for free.">
            <MoneyInput {...form.bind('memberPrice')} {...dis('memberPricePaise')} />
          </Field>
          <Field label="Non-member price" error={form.errors.nonMemberPrice} required={!form.values.membersOnly}>
            <MoneyInput {...form.bind('nonMemberPrice')} disabled={form.values.membersOnly || !can('nonMemberPricePaise') || submitting} />
          </Field>
          <div className="full stack-sm">
            <Checkbox {...form.bind('membersOnly', { type: 'checkbox' })} disabled={!can('nonMemberPricePaise') || submitting} label="Members only" hint="Non-members cannot book." />
            <Checkbox {...form.bind('memberDiscountEligible', { type: 'checkbox' })} disabled={!can('memberDiscountEligible') || submitting} label="Apply plan ticket discounts" hint="Members' plan discount is applied on top of the member price." />
          </div>
          <Field label="Early-bird member price" error={form.errors.ebMember} hint="Optional.">
            <MoneyInput {...form.bind('ebMember')} {...dis('earlyBirdMemberPricePaise')} />
          </Field>
          <Field label="Early-bird non-member price" error={form.errors.ebNonMember}>
            <MoneyInput {...form.bind('ebNonMember')} disabled={form.values.membersOnly || !can('earlyBirdNonMemberPricePaise') || submitting} />
          </Field>
          <Field label="Early-bird tickets available" hint="Leave blank for unlimited.">
            <Input type="number" min={1} inputMode="numeric" {...form.bind('ebQuantity')} {...dis('earlyBirdQuantity')} />
          </Field>
          <Field label="Early-bird ends" error={form.errors.ebEndsAt}>
            <Input type="datetime-local" {...form.bind('ebEndsAt')} {...dis('earlyBirdEndsAt')} />
          </Field>
        </div>
      </fieldset>
    </form>
  );
}
