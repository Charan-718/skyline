import { describe, expect, it } from 'vitest';
import { PAYMENT_PURPOSE_CATEGORY, samePosting, validateLedgerEntry } from '../../src/modules/finance/domain/ledgerRules.js';

const id = '22222222-2222-4222-8222-222222222222';
const club = '33333333-3333-4333-8333-333333333333';
const valid = {
  clubId: club,
  direction: 'IN',
  category: 'TICKET_SALE',
  amountPaise: 18000,
  sourceType: 'PAYMENT',
  sourceId: id,
  paymentId: id,
  description: 'ticket',
  occurredAt: new Date('2026-11-01T04:30:00Z'),
};

describe('ledger rules (LLD §2.10, §3.1)', () => {
  it('accepts a well-formed payment income entry', () => {
    expect(validateLedgerEntry(valid)).toEqual([]);
  });

  it('rejects category/direction mismatches, non-positive or float amounts, bad sources', () => {
    expect(validateLedgerEntry({ ...valid, category: 'DIRECT_EXPENSE' })).not.toEqual([]);
    expect(validateLedgerEntry({ ...valid, amountPaise: 0 })).not.toEqual([]);
    expect(validateLedgerEntry({ ...valid, amountPaise: 1.5 })).not.toEqual([]);
    expect(validateLedgerEntry({ ...valid, paymentId: club })).not.toEqual([]);
    expect(validateLedgerEntry({ ...valid, direction: 'OUT', category: 'DIRECT_EXPENSE' })).not.toEqual([]);
    expect(validateLedgerEntry({ ...valid, sourceType: 'INCOME_ENTRY', paymentId: undefined })).not.toEqual([]);
    expect(validateLedgerEntry({ ...valid, occurredAt: '2026-11-01' })).not.toEqual([]);
    expect(validateLedgerEntry({ ...valid, description: ' ' })).not.toEqual([]);
  });

  it('accepts expense OUT and income-entry IN shapes', () => {
    expect(
      validateLedgerEntry({ ...valid, direction: 'OUT', category: 'REIMBURSEMENT_PAYOUT', sourceType: 'EXPENSE', expenseId: id, paymentId: undefined }),
    ).toEqual([]);
    expect(
      validateLedgerEntry({ ...valid, category: 'FUNDRAISER_INCOME', sourceType: 'INCOME_ENTRY', paymentId: undefined }),
    ).toEqual([]);
  });

  it('maps each payment purpose to its income category', () => {
    expect(PAYMENT_PURPOSE_CATEGORY).toEqual({
      MEMBERSHIP_JOIN: 'MEMBERSHIP_DUES',
      MEMBERSHIP_RENEWAL: 'MEMBERSHIP_RENEWAL',
      EVENT_TICKET: 'TICKET_SALE',
      MERCH_ORDER: 'MERCH_SALE',
    });
  });

  it('samePosting compares club, direction, category and amount', () => {
    const row = { club_id: club, direction: 'IN', category: 'TICKET_SALE', amount_paise: 18000 };
    expect(samePosting(row, valid)).toBe(true);
    expect(samePosting({ ...row, amount_paise: 18001 }, valid)).toBe(false);
    expect(samePosting({ ...row, category: 'MERCH_SALE' }, valid)).toBe(false);
  });
});
