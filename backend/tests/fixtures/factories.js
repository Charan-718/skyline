import { randomUUID } from 'node:crypto';
import { randomToken } from '../../src/shared/tokens.js';

// Test data factories (LLD §10). Group 1 rows are inserted straight into the fixture tables;
// Group 2 rows go through Group 2 services where one exists.

let seq = 0;
const next = () => (seq += 1);

export async function makeUser(db, overrides = {}) {
  const n = next();
  const [row] = await db('users')
    .insert({
      email: `user${n}-${randomUUID().slice(0, 8)}@example.test`,
      full_name: overrides.fullName ?? `Test User ${n}`,
      phone_e164: overrides.phoneE164 ?? null,
      password_hash: 'not-a-real-hash',
      is_active: overrides.isActive ?? true,
    })
    .returning('*');
  return row;
}

/** makeClub(db, { head, treasurer, volunteers }) — role holders are created when not passed. */
export async function makeClub(db, { head, treasurer, volunteers = [] } = {}) {
  const n = next();
  const [club] = await db('clubs')
    .insert({ slug: `club-${n}-${randomUUID().slice(0, 6)}`, name: `Club ${n}`, member_number_prefix: `C${n}` })
    .returning('*');
  const headUser = head ?? (await makeUser(db, { fullName: `Head ${n}` }));
  const treasurerUser = treasurer === null ? null : (treasurer ?? (await makeUser(db, { fullName: `Treasurer ${n}` })));
  await assignRole(db, club.id, headUser.id, 'CLUB_HEAD');
  if (treasurerUser) await assignRole(db, club.id, treasurerUser.id, 'TREASURER');
  for (const v of volunteers) await assignRole(db, club.id, v.id, 'VOLUNTEER');
  return { club, head: headUser, treasurer: treasurerUser };
}

export async function assignRole(db, clubId, userId, role) {
  await db('club_role_assignments').insert({ club_id: clubId, user_id: userId, role });
}

export async function makePlan(db, club, creator, overrides = {}) {
  const [plan] = await db('membership_plans')
    .insert({
      club_id: club.id,
      name: overrides.name ?? `Plan ${next()}`,
      fee_paise: overrides.feePaise ?? 50000,
      duration_months: overrides.durationMonths ?? 12,
      event_discount_bps: 1000,
      merch_discount_bps: 1000,
      created_by: creator.id,
    })
    .returning('*');
  return plan;
}

/** A PENDING_PAYMENT membership + JOIN term — the target of a MEMBERSHIP_JOIN payment. */
export async function makePendingTerm(db, { club, user, plan }) {
  const [membership] = await db('memberships')
    .insert({ user_id: user.id, club_id: club.id, status: 'PENDING_PAYMENT', qr_token: randomToken() })
    .returning('*');
  const [term] = await db('membership_terms')
    .insert({
      membership_id: membership.id,
      club_id: club.id,
      user_id: user.id,
      kind: 'JOIN',
      source: 'MANUAL',
      plan_id: plan.id,
      plan_name: plan.name,
      fee_paise: plan.fee_paise,
      duration_months: plan.duration_months,
      event_discount_bps: plan.event_discount_bps,
      merch_discount_bps: plan.merch_discount_bps,
      early_bird_access: plan.early_bird_access,
      benefits_text: plan.benefits_text,
      status: 'PENDING_PAYMENT',
    })
    .returning('*');
  return { membership, term };
}

/**
 * Club + member + plan + pending term + INITIATED payment created through payments.create.
 * Returns everything a payments test needs.
 */
export async function makeMembershipPayment(ctx, { club: existingClub, user: existingUser, method = 'SIMULATED', amountPaise } = {}) {
  const { db, container } = ctx;
  const clubData = existingClub ?? (await makeClub(db));
  const user = existingUser ?? (await makeUser(db));
  const plan = await makePlan(db, clubData.club, clubData.head, { feePaise: amountPaise ?? 50000 });
  const { membership, term } = await makePendingTerm(db, { club: clubData.club, user, plan });
  const payment = await container.withTransaction((trx) =>
    container.finance.payments.create(trx, {
      clubId: clubData.club.id,
      userId: user.id,
      purpose: 'MEMBERSHIP_JOIN',
      membershipTermId: term.id,
      amountPaise: plan.fee_paise,
      method,
    }),
  );
  return { ...clubData, user, plan, membership, term, payment };
}

/** An event of the club with `organizer` assigned (Group 1 fixture rows) — makes the organizer TEAM. */
export async function makeEventWithOrganizer(db, { club, head, organizer }) {
  const [event] = await db('events')
    .insert({
      club_id: club.id,
      title: `Event ${next()}`,
      venue: 'Hall A',
      starts_at: '2026-12-01T10:00:00Z',
      ends_at: '2026-12-01T12:00:00Z',
      registration_opens_at: '2026-11-01T00:00:00Z',
      registration_closes_at: '2026-11-30T00:00:00Z',
      capacity: 100,
      member_price_paise: 0,
      status: 'DRAFT',
      created_by: head.id,
    })
    .returning('*');
  if (organizer) await db('event_organizers').insert({ event_id: event.id, user_id: organizer.id, assigned_by: head.id });
  return event;
}

export async function makeFundraiser(db, { club, head }, overrides = {}) {
  const [f] = await db('fundraisers')
    .insert({
      club_id: club.id,
      name: overrides.name ?? `Fundraiser ${next()}`,
      starts_on: overrides.startsOn ?? '2026-10-01',
      target_date: overrides.targetDate ?? '2026-12-31',
      goal_amount_paise: overrides.goalAmountPaise ?? null,
      status: overrides.status ?? 'ACTIVE',
      created_by: head.id,
    })
    .returning('*');
  return f;
}

export async function makeTask(db, fundraiser, creator, overrides = {}) {
  const [t] = await db('fundraiser_tasks')
    .insert({
      fundraiser_id: fundraiser.id,
      club_id: fundraiser.club_id,
      title: overrides.title ?? `Task ${next()}`,
      assignee_user_id: overrides.assigneeUserId ?? null,
      deadline: overrides.deadline ?? '2026-11-15T12:00:00Z',
      status: overrides.status ?? 'TODO',
      progress_percent: overrides.progressPercent ?? (overrides.status === 'DONE' ? 100 : 0),
      completed_at: overrides.status === 'DONE' ? new Date() : null,
      created_by: creator.id,
    })
    .returning('*');
  return t;
}

/** Product + variants straight into the Group 2 tables. variants: [{ size, stock, threshold, active }] */
export async function makeProduct(db, { club, head }, overrides = {}) {
  const n = next();
  const [category] = await db('product_categories').insert({ club_id: club.id, name: `Cat ${n}` }).returning('*');
  const [product] = await db('products')
    .insert({
      club_id: club.id,
      category_id: category.id,
      name: overrides.name ?? `Tee ${n}`,
      price_paise: overrides.pricePaise ?? 50000,
      available_to_non_members: overrides.availableToNonMembers ?? true,
      status: overrides.status ?? 'ACTIVE',
      created_by: head.id,
    })
    .returning('*');
  const variants = {};
  for (const v of overrides.variants ?? [{ size: 'M', stock: 10 }]) {
    const [row] = await db('product_variants')
      .insert({ product_id: product.id, club_id: club.id, size_label: v.size, stock_on_hand: v.stock, low_stock_threshold: v.threshold ?? 0, is_active: v.active ?? true })
      .returning('*');
    variants[v.size] = row;
  }
  return { product, category, variants };
}

/** An ACTIVE member with a PAID term covering the test clock date (Group 1 fixture rows). */
export async function makeActiveMember(db, { club, head }, user) {
  const plan = await makePlan(db, club, head);
  const [membership] = await db('memberships')
    .insert({ user_id: user.id, club_id: club.id, status: 'ACTIVE', current_plan_id: plan.id, started_on: '2026-07-01', expires_on: '2027-06-30', qr_token: randomToken() })
    .returning('*');
  const [term] = await db('membership_terms')
    .insert({
      membership_id: membership.id, club_id: club.id, user_id: user.id, kind: 'JOIN', source: 'MANUAL', plan_id: plan.id,
      plan_name: plan.name, fee_paise: plan.fee_paise, duration_months: 12, event_discount_bps: 1000, merch_discount_bps: 1000,
      early_bird_access: false, benefits_text: '', status: 'PAID', starts_on: '2026-07-01', ends_on: '2027-06-30', paid_at: new Date(),
    })
    .returning('*');
  return { membership, term, plan };
}
