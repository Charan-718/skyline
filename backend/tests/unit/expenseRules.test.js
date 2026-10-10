import { describe, expect, it } from 'vitest';
import { canTransitionExpense, dateProblems, ledgerCategoryFor } from '../../src/modules/finance/domain/expenseStateMachine.js';
import { budgetFigures, summarize } from '../../src/modules/finance/domain/formulas.js';
import { divRoundHalfUp } from '../../src/shared/intMath.js';
import { addDays, isValidIsoDate, startOfDay } from '../../src/shared/dates.js';

describe('expense lifecycle (LLD §2.10)', () => {
  it('only SUBMITTED→APPROVED|REJECTED and APPROVED→PAID', () => {
    expect(canTransitionExpense('SUBMITTED', 'APPROVED')).toBe(true);
    expect(canTransitionExpense('SUBMITTED', 'REJECTED')).toBe(true);
    expect(canTransitionExpense('APPROVED', 'PAID')).toBe(true);
    for (const [a, b] of [['SUBMITTED', 'PAID'], ['APPROVED', 'REJECTED'], ['REJECTED', 'APPROVED'], ['PAID', 'APPROVED'], ['APPROVED', 'SUBMITTED']]) {
      expect(canTransitionExpense(a, b)).toBe(false);
    }
  });

  it('only PAID has a ledger effect', () => {
    expect(ledgerCategoryFor({ kind: 'REIMBURSEMENT', status: 'SUBMITTED' })).toBeNull();
    expect(ledgerCategoryFor({ kind: 'REIMBURSEMENT', status: 'APPROVED' })).toBeNull();
    expect(ledgerCategoryFor({ kind: 'REIMBURSEMENT', status: 'PAID' })).toBe('REIMBURSEMENT_PAYOUT');
    expect(ledgerCategoryFor({ kind: 'DIRECT', status: 'PAID' })).toBe('DIRECT_EXPENSE');
  });

  it('date rules: no future incurredOn/paidOn; paidOn ≥ incurredOn', () => {
    const today = '2026-11-01';
    expect(dateProblems({ incurredOn: '2026-11-01', today })).toEqual([]);
    expect(dateProblems({ incurredOn: '2026-11-02', today })[0].path).toBe('incurredOn');
    expect(dateProblems({ incurredOn: '2026-10-10', paidOn: '2026-10-09', today })[0].path).toBe('paidOn');
    expect(dateProblems({ incurredOn: '2026-10-10', paidOn: '2026-11-02', today })[0].path).toBe('paidOn');
    expect(dateProblems({ incurredOn: '2026-10-10', paidOn: '2026-10-10', today })).toEqual([]);
  });
});

describe('finance formulas (LLD §2.10) — pure', () => {
  it('pending review is reported but never subtracted; projected = available − approved', () => {
    const s = summarize({
      periodByCategory: { IN: { TICKET_SALE: 1000, FUNDRAISER_INCOME: 500 }, OUT: { DIRECT_EXPENSE: 300 } },
      allTimeIn: 5000,
      allTimeOut: 1200,
      approvedUnpaid: 700,
      pendingReview: 900,
    });
    expect(s).toEqual({
      totalIncomePaise: 1500,
      incomeByCategory: { MEMBERSHIP_DUES: 0, MEMBERSHIP_RENEWAL: 0, TICKET_SALE: 1000, MERCH_SALE: 0, FUNDRAISER_INCOME: 500 },
      totalPaidExpensesPaise: 300,
      availableBalancePaise: 3800,
      approvedUnpaidTotalPaise: 700,
      pendingReviewTotalPaise: 900,
      projectedBalancePaise: 3100,
    });
  });

  it('budget remaining and remaining after committed', () => {
    expect(budgetFigures({ amount: 400000, spent: 210000, committed: 15000 })).toEqual({
      amountPaise: 400000,
      spentPaise: 210000,
      committedPaise: 15000,
      remainingPaise: 190000,
      remainingAfterCommittedPaise: 175000,
    });
  });
});

describe('integer helpers and dates', () => {
  it('divRoundHalfUp', () => {
    expect(divRoundHalfUp(167, 4)).toBe(42);
    expect(divRoundHalfUp(67, 2)).toBe(34);
    expect(divRoundHalfUp(1, 3)).toBe(0);
    expect(divRoundHalfUp(0, 5)).toBe(0);
    expect(() => divRoundHalfUp(1, 0)).toThrow(RangeError);
    expect(() => divRoundHalfUp(1.5, 2)).toThrow(RangeError);
  });

  it('startOfDay in IST, addDays, date validation', () => {
    expect(startOfDay('2026-11-01', 'Asia/Kolkata').toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(startOfDay('2026-11-01', 'UTC').toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
  });
});
