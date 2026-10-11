import { describe, expect, it } from 'vitest';
import { changedKeys, checkEventRules } from '../../src/modules/events/domain/eventRules.js';

const NOW = new Date('2026-10-11T06:30:00Z'); // Sun 11 Oct 2026, 12:00 IST
const ok = {
  title: 'Gala',
  venue: 'Hall',
  startsAt: '2026-11-01T12:30:00Z',
  endsAt: '2026-11-01T16:30:00Z',
  registrationOpensAt: '2026-10-11T06:00:00Z',
  registrationClosesAt: '2026-11-01T11:30:00Z',
  capacity: 50,
  memberPricePaise: 10000,
  nonMemberPricePaise: 15000,
};
const check = (patch, opts = {}) => checkEventRules({ ...ok, ...patch }, { now: NOW, ...opts });

describe('event rules', () => {
  it('a sound event passes in every mode', () => {
    expect(check({})).toEqual({});
    expect(check({}, { mode: 'publish' })).toEqual({});
    expect(check({}, { mode: 'update', changed: Object.keys(ok) })).toEqual({});
  });

  it('timeline order: registration opens < closes <= start < end', () => {
    expect(check({ registrationClosesAt: ok.registrationOpensAt })).toEqual({ registrationClosesAt: 'Must be after registration opens.' });
    expect(check({ registrationClosesAt: '2026-11-01T13:00:00Z' })).toEqual({ registrationClosesAt: 'Registration must close before the event starts.' });
    expect(check({ registrationClosesAt: ok.startsAt })).toEqual({}); // closing exactly at the start is allowed
    expect(check({ endsAt: ok.startsAt })).toEqual({ endsAt: 'Must be after the start.' });
    expect(check({ earlyAccessOpensAt: ok.registrationOpensAt })).toEqual({ earlyAccessOpensAt: 'Must be before general registration opens.' });
  });

  it('create: start, end and registration close must be in the future (yesterday, earlier today)', () => {
    expect(check({ startsAt: '2026-10-10T12:30:00Z', endsAt: '2026-10-10T14:30:00Z', registrationClosesAt: '2026-10-10T11:00:00Z', registrationOpensAt: '2026-10-09T00:00:00Z' })).toEqual({
      startsAt: 'Must be in the future.',
      endsAt: 'Must be in the future.',
      registrationClosesAt: 'Must be in the future.',
    });
    expect(check({ startsAt: '2026-10-11T06:00:00Z', endsAt: '2026-10-11T08:00:00Z', registrationClosesAt: '2026-10-11T05:00:00Z', registrationOpensAt: '2026-10-10T00:00:00Z' }).startsAt).toBe('Must be in the future.');
    expect(check({ registrationOpensAt: '2026-01-01T00:00:00Z' })).toEqual({}); // registration may already be open
  });

  it('early bird: needs an end inside the registration window; members-only has no non-member early bird', () => {
    expect(check({ earlyBirdMemberPricePaise: 8000 })).toEqual({ earlyBirdEndsAt: 'Set when early-bird pricing ends.' });
    expect(check({ earlyBirdMemberPricePaise: 8000, earlyBirdEndsAt: '2026-10-20T00:00:00Z' })).toEqual({});
    expect(check({ earlyBirdMemberPricePaise: 8000, earlyBirdEndsAt: '2026-11-01T12:00:00Z' })).toEqual({ earlyBirdEndsAt: 'Must fall within the registration window.' });
    expect(check({ earlyBirdMemberPricePaise: 8000, earlyBirdEndsAt: '2026-10-10T00:00:00Z' })).toEqual({ earlyBirdEndsAt: 'Must fall within the registration window.' });
    expect(check({ nonMemberPricePaise: null, earlyBirdNonMemberPricePaise: 9000, earlyBirdEndsAt: '2026-10-20T00:00:00Z' }).earlyBirdNonMemberPricePaise).toMatch(/Members-only/);
    expect(check({ earlyBirdQuantity: 10 })).toEqual({ earlyBirdQuantity: 'Set an early-bird price, or leave the early-bird quantity empty.' });
  });

  it('update: only rules touching changed fields are reported; capacity and early-bird minimums', () => {
    const old = { ...ok, startsAt: '2026-01-01T12:30:00Z', endsAt: '2026-01-01T16:30:00Z', registrationClosesAt: '2025-12-31T00:00:00Z', registrationOpensAt: '2025-12-01T00:00:00Z' };
    const update = (patch, extra) => checkEventRules({ ...old, ...patch }, { now: NOW, mode: 'update', changed: Object.keys(patch), ...extra });
    expect(update({ venue: 'New hall' })).toEqual({}); // past event, unrelated edit is fine
    expect(update({ startsAt: '2026-10-01T12:30:00Z' })).toMatchObject({ startsAt: 'Must be in the future.' });
    expect(update({ capacity: 5 }, { seatsReserved: 8 })).toEqual({ capacity: 'Minimum 8 (seats already sold or held).' });
    expect(update({ capacity: 8 }, { seatsReserved: 8 })).toEqual({});
    expect(update({ earlyBirdQuantity: 2, earlyBirdMemberPricePaise: 1, earlyBirdEndsAt: '2025-12-15T00:00:00Z' }, { earlyBirdReserved: 3 }).earlyBirdQuantity).toMatch(/Minimum 3/);
  });

  it('publish: refuses an event that already started or whose registration closed', () => {
    expect(check({}, { mode: 'publish', now: new Date('2026-11-01T11:45:00Z') })).toEqual({ registrationClosesAt: 'Registration has already closed. Move it to a future date before publishing.' });
    expect(check({}, { mode: 'publish', now: new Date('2026-11-01T13:00:00Z') }).startsAt).toMatch(/already started/);
  });

  it('changedKeys compares instants and pg BIGINT strings by value', () => {
    const saved = { startsAt: new Date('2026-11-01T12:30:00Z'), memberPricePaise: '10000', venue: 'Hall', earlyBirdEndsAt: null };
    expect(changedKeys(saved, { startsAt: '2026-11-01T12:30:00.000Z', memberPricePaise: 10000, venue: 'Hall', earlyBirdEndsAt: null })).toEqual([]);
    expect(changedKeys(saved, { startsAt: '2026-11-01T13:30:00Z', memberPricePaise: 12000, venue: 'Hall 2' })).toEqual(['startsAt', 'memberPricePaise', 'venue']);
  });
});
