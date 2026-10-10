import { describe, expect, it } from 'vitest';
import { canApprove, canPay } from '../../src/modules/finance/domain/approvalPolicy.js';

// OQ-21 / Step 3 §B4 / OQ-44 — every combination of actor roles × submitter (payee) roles.
// Roles: CH = CLUB_HEAD, TR = TREASURER, VOL = VOLUNTEER, ORG = event organizer, none.

const ROLESETS = {
  none: [],
  VOL: ['VOLUNTEER'],
  ORG: ['ORGANIZER'],
  TR: ['TREASURER'],
  CH: ['CLUB_HEAD'],
  'CH+TR': ['CLUB_HEAD', 'TREASURER'],
};
const roles = (name) => new Set(ROLESETS[name]);
const ACTOR = 'actor';
const OTHER = 'someone-else';

// expected[actorRoles][submitterRoles] for a claim submitted by someone else
const APPROVE = {
  none:    { none: 'FORBIDDEN', VOL: 'FORBIDDEN', ORG: 'FORBIDDEN', TR: 'FORBIDDEN', CH: 'FORBIDDEN', 'CH+TR': 'FORBIDDEN' },
  VOL:     { none: 'FORBIDDEN', VOL: 'FORBIDDEN', ORG: 'FORBIDDEN', TR: 'FORBIDDEN', CH: 'FORBIDDEN', 'CH+TR': 'FORBIDDEN' },
  ORG:     { none: 'FORBIDDEN', VOL: 'FORBIDDEN', ORG: 'FORBIDDEN', TR: 'FORBIDDEN', CH: 'FORBIDDEN', 'CH+TR': 'FORBIDDEN' },
  TR:      { none: 'OK',        VOL: 'OK',        ORG: 'OK',        TR: 'OK',        CH: 'OK',        'CH+TR': 'FORBIDDEN' },
  CH:      { none: 'FORBIDDEN', VOL: 'FORBIDDEN', ORG: 'FORBIDDEN', TR: 'OK',        CH: 'FORBIDDEN', 'CH+TR': 'OK' },
  'CH+TR': { none: 'OK',        VOL: 'OK',        ORG: 'OK',        TR: 'OK',        CH: 'OK',        'CH+TR': 'OK' },
};

// OQ-44 APPROVED: payouts follow exactly the same rule as approvals.
const PAY = APPROVE;

const result = (r) => (r.allowed ? 'OK' : r.code);
const cases = (table) => Object.entries(table).flatMap(([a, row]) => Object.entries(row).map(([p, want]) => [a, p, want]));

describe('approvalPolicy.canApprove — someone else’s claim', () => {
  it.each(cases(APPROVE))('actor %s, submitter %s → %s', (actorRoles, submitterRoles, want) => {
    const r = canApprove({ userId: ACTOR, roles: roles(actorRoles) }, { submitted_by: OTHER }, { submitterRoles: roles(submitterRoles) });
    expect(result(r)).toBe(want);
  });
});

describe('approvalPolicy.canApprove — own claim', () => {
  it.each([
    ['none', 'FORBIDDEN'],
    ['VOL', 'FORBIDDEN'],
    ['ORG', 'FORBIDDEN'],
    ['TR', 'SELF_APPROVAL_FORBIDDEN'],
    ['CH', 'SELF_APPROVAL_FORBIDDEN'],
    ['CH+TR', 'SELF_APPROVAL_FORBIDDEN'],
  ])('actor %s approving own claim → %s', (r, want) => {
    expect(result(canApprove({ userId: ACTOR, roles: roles(r) }, { submitted_by: ACTOR }, { submitterRoles: roles(r) }))).toBe(want);
  });
});

describe('approvalPolicy.canPay — someone else’s payout', () => {
  it.each(cases(PAY))('actor %s, payee %s → %s', (actorRoles, payeeRoles, want) => {
    const r = canPay({ userId: ACTOR, roles: roles(actorRoles) }, { payee_user_id: OTHER }, { payeeRoles: roles(payeeRoles) });
    expect(result(r)).toBe(want);
  });
});

describe('approvalPolicy.canPay — own payout', () => {
  it.each([
    ['VOL', 'FORBIDDEN'],
    ['TR', 'SELF_PAYOUT_FORBIDDEN'],
    ['CH', 'SELF_PAYOUT_FORBIDDEN'],
    ['CH+TR', 'SELF_PAYOUT_FORBIDDEN'],
  ])('actor %s paying self → %s', (r, want) => {
    expect(result(canPay({ userId: ACTOR, roles: roles(r) }, { payee_user_id: ACTOR }, { payeeRoles: roles(r) }))).toBe(want);
  });
});
