/**
 * PostgreSQL demo data aligned with frontend `src/api/mock/seed.js` (same clubs, events,
 * demo login accounts, password `demo1234`). Idempotent when skyline slug already exists.
 */
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { randomToken, ticketCode, pickupCode, randomReference } from '../../../shared/tokens.js';
import { addDaysToDate, computeTermEndsOn, todayIST } from '../../../shared/clock.js';
import { daysFromNow, dateOnly } from './seedTime.js';
import {
  COLLEGE_DOMAIN,
  CORE_TEAM_EMAILS,
  STUDENT_FIRST as FIRST,
  STUDENT_LAST as LAST,
  studentEmail,
  studentRoll,
} from './demoSeedConstants.js';

export const DEMO_PASSWORD = 'demo1234';
export { COLLEGE_DOMAIN, CORE_TEAM_EMAILS };

function verificationHash(studentIdentifier) {
  const key = process.env.VERIFICATION_HASH_KEY || 'dev-verification-hmac-key-change-in-prod';
  return crypto.createHmac('sha256', key).update(studentIdentifier).digest('hex');
}

export async function insertUser(knex, { email, fullName, phoneE164, passwordHash, verified, studentIdentifier }) {
  const [user] = await knex('users')
    .insert({
      email: email.toLowerCase(),
      full_name: fullName,
      phone_e164: phoneE164 ?? null,
      password_hash: passwordHash,
      is_active: true,
    })
    .returning('*');
  if (verified && studentIdentifier) {
    await knex('college_verifications').insert({
      user_id: user.id,
      outcome: 'VERIFIED',
      student_identifier_hash: verificationHash(studentIdentifier),
      adapter: 'mock',
      checked_at: daysFromNow(-280),
    });
  }
  return user;
}

async function assignRole(knex, { clubId, userId, role, assignedBy }) {
  await knex('club_role_assignments').insert({
    club_id: clubId,
    user_id: userId,
    role,
    assigned_by: assignedBy,
  });
}

async function nextMemberNumber(knex, clubId, prefix) {
  const [club] = await knex('clubs').where({ id: clubId }).forUpdate().select('next_member_seq');
  const seq = club.next_member_seq;
  await knex('clubs').where({ id: clubId }).update({ next_member_seq: seq + 1 });
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export async function activateMembership(knex, { userId, clubId, plan, daysAgo, prefix }) {
  const startsOn = addDaysToDate(todayIST(), -daysAgo);
  const endsOn = computeTermEndsOn(startsOn, plan.duration_months);
  const memberNumber = await nextMemberNumber(knex, clubId, prefix);
  const [membership] = await knex('memberships')
    .insert({
      user_id: userId,
      club_id: clubId,
      status: 'ACTIVE',
      member_number: memberNumber,
      current_plan_id: plan.id,
      started_on: startsOn,
      expires_on: endsOn,
      qr_token: randomToken(16),
      autopay_enabled: false,
    })
    .returning('*');
  const [term] = await knex('membership_terms')
    .insert({
      membership_id: membership.id,
      club_id: clubId,
      user_id: userId,
      kind: 'JOIN',
      source: 'MANUAL',
      plan_id: plan.id,
      plan_name: plan.name,
      fee_paise: plan.fee_paise,
      duration_months: plan.duration_months,
      event_discount_bps: plan.event_discount_bps,
      merch_discount_bps: plan.merch_discount_bps,
      early_bird_access: plan.early_bird_access,
      benefits_text: plan.benefits_text ?? '',
      status: 'PAID',
      starts_on: startsOn,
      ends_on: endsOn,
      paid_at: daysFromNow(-daysAgo, 11),
    })
    .returning('*');
  if (Number(plan.fee_paise) > 0) {
    await knex('financial_transactions').insert({
      club_id: clubId,
      direction: 'IN',
      category: 'MEMBERSHIP_DUES',
      amount_paise: plan.fee_paise,
      source_type: 'INCOME_ENTRY',
      source_id: term.id,
      membership_id: membership.id,
      payer_user_id: userId,
      description: `${plan.name} membership`,
      reference: randomReference('MEM'),
      occurred_at: daysFromNow(-daysAgo, 11),
    });
  }
  return membership;
}

export async function stubReceipt(knex, clubId, uploadedBy, originalName = 'receipt.pdf') {
  const [file] = await knex('uploaded_files')
    .insert({
      club_id: clubId,
      uploaded_by: uploadedBy,
      purpose: 'RECEIPT',
      original_name: originalName,
      storage_key: `seed/${randomToken(6)}/${originalName}`,
      mime_type: 'application/pdf',
      size_bytes: 182000,
      sha256: 'a'.repeat(64),
    })
    .returning('id');
  return file.id;
}

export async function seedTicketBooking(knex, { event, userId, buyerType, finalPaise, usesEarlyBird, at, confirmed = true }) {
  await knex('events').where({ id: event.id }).update({
    seats_reserved: knex.raw('seats_reserved + 1'),
    early_bird_reserved: usesEarlyBird ? knex.raw('early_bird_reserved + 1') : knex.raw('early_bird_reserved'),
  });
  const [booking] = await knex('bookings')
    .insert({
      event_id: event.id,
      club_id: event.club_id,
      user_id: userId,
      status: confirmed ? 'CONFIRMED' : 'PENDING_PAYMENT',
      buyer_type: buyerType,
      price_tier: finalPaise === 0 ? 'FREE' : buyerType === 'MEMBER' ? 'MEMBER_REGULAR' : 'NON_MEMBER_REGULAR',
      list_price_paise: finalPaise,
      discount_paise: 0,
      final_price_paise: finalPaise,
      pricing_mode: 'BEST_OF',
      uses_early_bird: usesEarlyBird,
      hold_expires_at: confirmed ? null : daysFromNow(0, 12),
      confirmed_at: confirmed ? at : null,
    })
    .returning('*');
  if (confirmed) {
    await knex('tickets').insert({
      booking_id: booking.id,
      event_id: event.id,
      club_id: event.club_id,
      user_id: userId,
      ticket_code: ticketCode(),
      qr_token: randomToken(16),
      status: 'VALID',
    });
    if (finalPaise > 0) {
      const [pay] = await knex('payments')
        .insert({
          club_id: event.club_id,
          user_id: userId,
          purpose: 'EVENT_TICKET',
          booking_id: booking.id,
          amount_paise: finalPaise,
          method: 'SIMULATED',
          is_simulated: true,
          status: 'SUCCEEDED',
          reference: randomReference('SIM'),
          settled_at: at,
        })
        .returning('*');
      await knex('financial_transactions').insert({
        club_id: event.club_id,
        direction: 'IN',
        category: 'TICKET_SALE',
        amount_paise: finalPaise,
        source_type: 'PAYMENT',
        source_id: pay.id,
        payment_id: pay.id,
        event_id: event.id,
        payer_user_id: userId,
        reference: pay.reference,
        description: `Ticket: ${event.title}`,
        occurred_at: at,
      });
    }
  } else {
    await knex('payments').insert({
      club_id: event.club_id,
      user_id: userId,
      purpose: 'EVENT_TICKET',
      booking_id: booking.id,
      amount_paise: finalPaise,
      method: 'SIMULATED',
      is_simulated: true,
      status: 'INITIATED',
      reference: randomReference('SIM'),
    });
  }
  return booking;
}

export async function runDemoEngagementSeed(knex) {
  const existing = await knex('clubs').where({ slug: 'skyline' }).first();
  if (existing) {
    // eslint-disable-next-line no-console
    console.log('[seed] Demo data already present (club skyline) — skipping 002_demo_engagement');
    return;
  }

  await knex.transaction(async (trx) => {
    await seedDemoEngagement(trx);
  });
}

async function seedDemoEngagement(knex) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const asha = await insertUser(knex, {
    email: 'asha@skyline.ac.in',
    fullName: 'Asha Rao',
    phoneE164: '+919876543210',
    passwordHash,
    verified: true,
    studentIdentifier: 'SKY2023CS001',
  });
  const ravi = await insertUser(knex, {
    email: 'ravi@skyline.ac.in',
    fullName: 'Ravi Kumar',
    passwordHash,
    verified: true,
    studentIdentifier: 'SKY2022ME042',
  });
  const meera = await insertUser(knex, {
    email: 'meera@skyline.ac.in',
    fullName: 'Meera Iyer',
    passwordHash,
    verified: true,
    studentIdentifier: 'SKY2023EE056',
  });
  const karthik = await insertUser(knex, {
    email: 'karthik@skyline.ac.in',
    fullName: 'Karthik Reddy',
    passwordHash,
    verified: true,
    studentIdentifier: 'SKY2023IT088',
  });
  const priya = await insertUser(knex, {
    email: 'priya.nair@gmail.com',
    fullName: 'Priya Nair',
    phoneE164: null,
    passwordHash,
    verified: false,
    studentIdentifier: null,
  });
  const vikram = await insertUser(knex, {
    email: 'vikram@skyline.ac.in',
    fullName: 'Vikram Shetty',
    passwordHash,
    verified: true,
    studentIdentifier: 'SKY2023CE044',
  });

  const others = [];
  for (let i = 0; i < 12; i += 1) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const name = `${first} ${last}`;
    others.push(
      await insertUser(knex, {
        email: studentEmail(first, last, i > 0 ? String(i) : ''),
        fullName: name,
        passwordHash,
        verified: true,
        studentIdentifier: studentRoll(2023, 'CS', 100 + i),
      }),
    );
  }

  const [sky] = await knex('clubs')
    .insert({
      slug: 'skyline',
      name: 'Skyline Student Association',
      description:
        'The college-wide student association: fests, workshops, welfare drives and the semester merch drop.',
      contact_email: 'office@skyline.ac.in',
      member_number_prefix: 'SKY',
      next_member_seq: 1,
      is_active: true,
    })
    .returning('*');
  const [robo] = await knex('clubs')
    .insert({
      slug: 'robotics',
      name: 'Robotics Club',
      description: 'Build nights, line-follower races and the inter-college robotics league.',
      contact_email: 'robotics@skyline.ac.in',
      member_number_prefix: 'ROB',
      next_member_seq: 1,
      is_active: true,
    })
    .returning('*');
  const [photo] = await knex('clubs')
    .insert({
      slug: 'photography',
      name: 'Photography Society',
      description: 'Photo walks, editing workshops and the annual campus exhibition.',
      contact_email: 'photography@skyline.ac.in',
      member_number_prefix: 'PHO',
      next_member_seq: 1,
      is_active: true,
    })
    .returning('*');

  await assignRole(knex, { clubId: sky.id, userId: asha.id, role: 'CLUB_HEAD', assignedBy: asha.id });
  await assignRole(knex, { clubId: sky.id, userId: ravi.id, role: 'TREASURER', assignedBy: asha.id });
  await assignRole(knex, { clubId: sky.id, userId: meera.id, role: 'VOLUNTEER', assignedBy: asha.id });
  await assignRole(knex, { clubId: sky.id, userId: others[0].id, role: 'VOLUNTEER', assignedBy: asha.id });
  await assignRole(knex, { clubId: sky.id, userId: others[1].id, role: 'VOLUNTEER', assignedBy: asha.id });
  await assignRole(knex, { clubId: robo.id, userId: vikram.id, role: 'CLUB_HEAD', assignedBy: vikram.id });
  await assignRole(knex, { clubId: robo.id, userId: asha.id, role: 'VOLUNTEER', assignedBy: vikram.id });
  await assignRole(knex, { clubId: robo.id, userId: karthik.id, role: 'TREASURER', assignedBy: vikram.id });
  await assignRole(knex, { clubId: photo.id, userId: karthik.id, role: 'CLUB_HEAD', assignedBy: karthik.id });

  const planRow = async (clubId, createdBy, row) => {
    const [p] = await knex('membership_plans')
      .insert({ club_id: clubId, created_by: createdBy, status: 'ACTIVE', ...row })
      .returning('*');
    return p;
  };
  const skySem = await planRow(sky.id, asha.id, {
    name: 'Semester',
    description: 'Six months of membership for one semester.',
    benefits_text: '10% off event tickets\n5% off merchandise',
    fee_paise: 30000,
    duration_months: 6,
    event_discount_bps: 1000,
    merch_discount_bps: 500,
    early_bird_access: false,
  });
  const skyAnnual = await planRow(sky.id, asha.id, {
    name: 'Annual',
    description: 'Full academic year with early access to popular events.',
    benefits_text: '15% off event tickets\n10% off merchandise\nEarly access to registrations',
    fee_paise: 50000,
    duration_months: 12,
    event_discount_bps: 1500,
    merch_discount_bps: 1000,
    early_bird_access: true,
  });
  await planRow(sky.id, asha.id, {
    name: 'Founders 2025',
    description: 'Launch offer for the first batch.',
    benefits_text: '20% off everything',
    fee_paise: 25000,
    duration_months: 12,
    event_discount_bps: 2000,
    merch_discount_bps: 2000,
    early_bird_access: true,
    status: 'ARCHIVED',
  });
  const roboStd = await planRow(robo.id, vikram.id, {
    name: 'Builder',
    description: 'Lab access and league registration.',
    benefits_text: 'Free build nights\n10% off kits',
    fee_paise: 40000,
    duration_months: 12,
    event_discount_bps: 1000,
    merch_discount_bps: 1000,
    early_bird_access: true,
  });
  await planRow(photo.id, karthik.id, {
    name: 'Shutterbug',
    description: 'Walks, workshops and exhibition entry.',
    benefits_text: 'Free photo walks\n10% off prints',
    fee_paise: 20000,
    duration_months: 6,
    event_discount_bps: 1000,
    merch_discount_bps: 1000,
    early_bird_access: false,
  });

  const ashaSkyMem = await activateMembership(knex, {
    userId: asha.id,
    clubId: sky.id,
    plan: skyAnnual,
    daysAgo: 120,
    prefix: 'SKY',
  });
  await knex('memberships').where({ id: ashaSkyMem.id }).update({
    autopay_enabled: true,
    autopay_plan_id: skyAnnual.id,
    autopay_amount_paise: skyAnnual.fee_paise,
  });
  await knex('autopay_consents').insert({
    membership_id: ashaSkyMem.id,
    user_id: asha.id,
    action: 'ENABLED',
    plan_id: skyAnnual.id,
    consented_amount_paise: skyAnnual.fee_paise,
    consent_text_version: 'v1',
  });

  await activateMembership(knex, { userId: ravi.id, clubId: sky.id, plan: skyAnnual, daysAgo: 118, prefix: 'SKY' });
  await activateMembership(knex, { userId: meera.id, clubId: sky.id, plan: skySem, daysAgo: 100, prefix: 'SKY' });
  await activateMembership(knex, { userId: karthik.id, clubId: sky.id, plan: skyAnnual, daysAgo: 90, prefix: 'SKY' });
  await activateMembership(knex, { userId: vikram.id, clubId: robo.id, plan: roboStd, daysAgo: 150, prefix: 'ROB' });
  await activateMembership(knex, { userId: asha.id, clubId: robo.id, plan: roboStd, daysAgo: 140, prefix: 'ROB' });
  for (let i = 0; i < others.length; i += 1) {
    if (i % 6 === 5) continue;
    await activateMembership(knex, {
      userId: others[i].id,
      clubId: sky.id,
      plan: i % 3 === 0 ? skyAnnual : skySem,
      daysAgo: 10 + ((i * 13) % 160),
      prefix: 'SKY',
    });
  }

  const eventRow = async (clubId, createdBy, row) => {
    const [ev] = await knex('events')
      .insert({
        club_id: clubId,
        created_by: createdBy,
        description: '',
        seats_reserved: 0,
        early_bird_reserved: 0,
        member_discount_eligible: true,
        ...row,
      })
      .returning('*');
    return ev;
  };

  const techFest = await eventRow(sky.id, asha.id, {
    title: 'Skyline Tech Fest 2026',
    description: 'Two days of talks, project expo and the inter-department coding sprint. Lunch included both days.',
    venue: 'Main Auditorium & CSE Block',
    capacity: 300,
    member_price_paise: 20000,
    non_member_price_paise: 35000,
    early_bird_member_price_paise: 15000,
    early_bird_non_member_price_paise: 28000,
    early_bird_quantity: 80,
    early_bird_ends_at: daysFromNow(6),
    early_access_opens_at: daysFromNow(-30),
    registration_opens_at: daysFromNow(-25),
    registration_closes_at: daysFromNow(19),
    starts_at: daysFromNow(20, 9),
    ends_at: daysFromNow(21, 18),
    status: 'PUBLISHED',
    published_at: daysFromNow(-20),
  });
  const freshers = await eventRow(sky.id, asha.id, {
    title: "Freshers' Welcome Night",
    description: 'Music, games and introductions for the incoming batch.',
    venue: 'Open Air Theatre',
    capacity: 220,
    member_price_paise: 10000,
    non_member_price_paise: 15000,
    registration_opens_at: daysFromNow(-60),
    registration_closes_at: daysFromNow(-31),
    starts_at: daysFromNow(-30, 18),
    ends_at: daysFromNow(-30, 22),
    status: 'PUBLISHED',
    published_at: daysFromNow(-45),
  });
  const hack = await eventRow(sky.id, asha.id, {
    title: '24h Campus Hackathon',
    description: 'Members-only overnight hackathon. Teams of up to four; mentors from alumni startups.',
    venue: 'Innovation Lab',
    capacity: 60,
    member_price_paise: 0,
    non_member_price_paise: null,
    registration_opens_at: daysFromNow(-5),
    registration_closes_at: daysFromNow(9),
    starts_at: daysFromNow(10, 9),
    ends_at: daysFromNow(11, 9),
    status: 'PUBLISHED',
    published_at: daysFromNow(-4),
  });
  await eventRow(sky.id, asha.id, {
    title: 'Startup Pitch Workshop',
    description: 'Learn to write a 3-minute pitch with feedback from the incubation cell.',
    venue: 'Seminar Hall 2',
    capacity: 80,
    member_price_paise: 5000,
    non_member_price_paise: 10000,
    registration_opens_at: daysFromNow(5),
    registration_closes_at: daysFromNow(29),
    starts_at: daysFromNow(30, 14),
    ends_at: daysFromNow(30, 17),
    status: 'DRAFT',
  });
  await eventRow(sky.id, asha.id, {
    title: 'Monsoon Film Screening',
    description: 'Cancelled due to auditorium maintenance.',
    venue: 'Main Auditorium',
    capacity: 150,
    member_price_paise: 3000,
    non_member_price_paise: 5000,
    registration_opens_at: daysFromNow(-20),
    registration_closes_at: daysFromNow(-2),
    starts_at: daysFromNow(-1, 18),
    ends_at: daysFromNow(-1, 21),
    status: 'CANCELLED',
    cancel_reason: 'Venue unavailable',
    cancelled_at: daysFromNow(-3),
  });
  const roboRace = await eventRow(robo.id, vikram.id, {
    title: 'Line Follower Race',
    description: 'Bring your bot. Three heats, fastest clean lap wins.',
    venue: 'Mech Workshop',
    capacity: 40,
    member_price_paise: 5000,
    non_member_price_paise: 12000,
    registration_opens_at: daysFromNow(-10),
    registration_closes_at: daysFromNow(13),
    starts_at: daysFromNow(14, 10),
    ends_at: daysFromNow(14, 16),
    status: 'PUBLISHED',
    published_at: daysFromNow(-8),
  });
  await eventRow(photo.id, karthik.id, {
    title: 'Golden Hour Photo Walk',
    description: 'Walk around the lake campus at sunset.',
    venue: 'Main Gate',
    capacity: 30,
    member_price_paise: 0,
    non_member_price_paise: 5000,
    registration_opens_at: daysFromNow(-3),
    registration_closes_at: daysFromNow(6),
    starts_at: daysFromNow(7, 17),
    ends_at: daysFromNow(7, 19),
    status: 'PUBLISHED',
    published_at: daysFromNow(-2),
  });

  const org = (eventId, userId, by) =>
    knex('event_organizers').insert({ event_id: eventId, user_id: userId, assigned_by: by });
  await org(techFest.id, karthik.id, asha.id);
  await org(freshers.id, karthik.id, asha.id);
  await org(hack.id, meera.id, asha.id);
  await org(roboRace.id, vikram.id, vikram.id);
  const staff = (eventId, userId, clubId, by) =>
    knex('event_staff').insert({ event_id: eventId, user_id: userId, club_id: clubId, assigned_by: by });
  await staff(techFest.id, meera.id, sky.id, asha.id);
  await staff(techFest.id, others[0].id, sky.id, asha.id);
  await staff(freshers.id, meera.id, sky.id, asha.id);
  await staff(hack.id, others[1].id, sky.id, asha.id);

  const audience = [asha, ravi, meera, karthik, priya, vikram, ...others];
  for (let i = 0; i < Math.min(18, audience.length); i += 1) {
    await seedTicketBooking(knex, {
      event: freshers,
      userId: audience[i].id,
      buyerType: i % 3 === 0 ? 'NON_MEMBER' : 'MEMBER',
      finalPaise: i % 3 === 0 ? 15000 : 10000,
      usesEarlyBird: false,
      at: daysFromNow(-35 + i, 10),
    });
  }
  await knex('events').where({ id: freshers.id }).update({ status: 'COMPLETED', completed_at: daysFromNow(-29) });
  const freshTickets = await knex('tickets').where({ event_id: freshers.id });
  for (let i = 0; i < freshTickets.length; i += 1) {
    if (i % 7 === 6) continue;
    const usedAt = daysFromNow(-30, 18 + (i % 3));
    await knex('tickets').where({ id: freshTickets[i].id }).update({
      status: 'USED',
      used_at: usedAt,
      used_by: meera.id,
    });
    await knex('check_ins').insert({
      ticket_id: freshTickets[i].id,
      event_id: freshers.id,
      checked_in_by: meera.id,
      checked_in_at: usedAt,
    });
  }

  for (let i = 1; i < 12; i += 1) {
    await seedTicketBooking(knex, {
      event: techFest,
      userId: audience[i % audience.length].id,
      buyerType: 'MEMBER',
      finalPaise: i < 6 ? 15000 : 20000,
      usesEarlyBird: i < 6,
      at: daysFromNow(-(i % 10), 11),
    });
  }
  await seedTicketBooking(knex, {
    event: techFest,
    userId: others[10].id,
    buyerType: 'MEMBER',
    finalPaise: 15000,
    usesEarlyBird: true,
    at: daysFromNow(0, 10),
    confirmed: false,
  });

  for (let i = 2; i < 8; i += 1) {
    await seedTicketBooking(knex, {
      event: hack,
      userId: audience[i].id,
      buyerType: 'MEMBER',
      finalPaise: 0,
      usesEarlyBird: false,
      at: daysFromNow(-2, 12),
    });
  }

  const ann = (clubId, row) =>
    knex('announcements').insert({
      club_id: clubId,
      created_by: asha.id,
      status: 'PUBLISHED',
      published_by: asha.id,
      published_at: row.publishedAt ?? daysFromNow(-5, 12),
      send_email: true,
      audience: 'PUBLIC',
      category: 'GENERAL',
      ...row,
    });
  await ann(sky.id, {
    title: 'Tech Fest early-bird tickets are live',
    body: 'Early-bird pricing is available for the first 80 tickets or until the deadline, whichever comes first.',
    category: 'EVENT',
    event_id: techFest.id,
    published_at: daysFromNow(-24, 12),
  });
  await ann(sky.id, {
    title: 'General body meeting on Friday, 4 PM',
    body: 'Agenda: semester calendar, merch drop, and volunteer sign-ups.',
    category: 'MEETING',
    audience: 'MEMBERS',
    published_at: daysFromNow(-9, 12),
  });
  await ann(sky.id, {
    title: 'Reimbursement deadline: 20th of this month',
    body: 'Submit all pending receipts through the Expenses page before the 20th.',
    category: 'DEADLINE',
    audience: 'MEMBERS',
    published_at: daysFromNow(-5, 12),
  });
  await ann(sky.id, {
    title: 'Hackathon venue moved to Innovation Lab',
    body: 'The hackathon has moved to the Innovation Lab (Block C, 2nd floor).',
    category: 'SCHEDULE_CHANGE',
    event_id: hack.id,
    published_at: daysFromNow(-2, 12),
  });
  await ann(sky.id, {
    title: 'Merch pickup desk timings',
    body: 'Draft. Confirm timings with the office before publishing.',
    category: 'GENERAL',
    status: 'DRAFT',
    published_by: null,
    published_at: null,
    send_email: false,
  });

  const [apparel] = await knex('product_categories').insert({ club_id: sky.id, name: 'Apparel' }).returning('*');
  const [accessories] = await knex('product_categories').insert({ club_id: sky.id, name: 'Accessories' }).returning('*');
  const [hoodie] = await knex('products')
    .insert({
      club_id: sky.id,
      category_id: apparel.id,
      name: 'Skyline Hoodie',
      description: 'Heavyweight navy hoodie with embroidered logo.',
      price_paise: 89900,
      offer_price_paise: 79900,
      offer_starts_at: daysFromNow(-3),
      offer_ends_at: daysFromNow(4),
      status: 'ACTIVE',
      created_by: asha.id,
    })
    .returning('*');
  const [hoodieVar] = await knex('product_variants')
    .insert({
      product_id: hoodie.id,
      club_id: sky.id,
      size_label: 'M',
      stock_on_hand: 24,
      low_stock_threshold: 5,
    })
    .returning('*');

  const [order] = await knex('orders')
    .insert({
      club_id: sky.id,
      user_id: asha.id,
      status: 'PICKED_UP',
      buyer_type: 'MEMBER',
      subtotal_paise: 79900,
      discount_paise: 7990,
      total_paise: 71910,
      pricing_mode: 'BEST_OF',
      pickup_code: pickupCode(),
      confirmed_at: daysFromNow(-18, 14),
      picked_up_at: daysFromNow(-16, 15),
      picked_up_by: asha.id,
    })
    .returning('*');
  await knex('order_items').insert({
    order_id: order.id,
    club_id: sky.id,
    product_id: hoodie.id,
    variant_id: hoodieVar.id,
    quantity: 1,
    unit_list_price_paise: 89900,
    unit_discount_paise: 7990,
    unit_final_price_paise: 71910,
    line_total_paise: 71910,
    price_rule: 'OFFER_PLUS_MEMBER',
  });

  const [winter] = await knex('fundraisers')
    .insert({
      club_id: sky.id,
      name: 'Winter Clothing Drive',
      description: 'Collect and distribute warm clothing items before December.',
      starts_on: dateOnly(daysFromNow(-20)),
      target_date: dateOnly(daysFromNow(25)),
      goal_amount_paise: 5000000,
      status: 'ACTIVE',
      created_by: asha.id,
    })
    .returning('*');
  await knex('fundraiser_tasks').insert([
    {
      fundraiser_id: winter.id,
      club_id: sky.id,
      title: 'Design collection posters',
      assignee_user_id: meera.id,
      deadline: daysFromNow(-12, 17),
      status: 'DONE',
      progress_percent: 100,
      completed_at: daysFromNow(-13, 15),
      created_by: asha.id,
    },
    {
      fundraiser_id: winter.id,
      club_id: sky.id,
      title: 'Set up drop boxes in hostels',
      assignee_user_id: others[0].id,
      deadline: daysFromNow(-5, 17),
      status: 'DONE',
      progress_percent: 100,
      completed_at: daysFromNow(-6, 15),
      created_by: asha.id,
    },
    {
      fundraiser_id: winter.id,
      club_id: sky.id,
      title: 'Coordinate with NGO for distribution',
      assignee_user_id: ravi.id,
      deadline: daysFromNow(10, 17),
      status: 'IN_PROGRESS',
      progress_percent: 60,
      created_by: asha.id,
    },
    {
      fundraiser_id: winter.id,
      club_id: sky.id,
      title: 'Sort and pack donations',
      assignee_user_id: meera.id,
      deadline: daysFromNow(18, 17),
      status: 'IN_PROGRESS',
      progress_percent: 35,
      created_by: asha.id,
    },
    {
      fundraiser_id: winter.id,
      club_id: sky.id,
      title: 'Arrange transport (2 vans)',
      assignee_user_id: others[1].id,
      deadline: daysFromNow(20, 17),
      status: 'TODO',
      progress_percent: 0,
      created_by: asha.id,
    },
  ]);

  const semStart = todayIST();
  await knex('budgets').insert({
    club_id: sky.id,
    name: 'Odd semester 2026',
    period_start: addDaysToDate(semStart, -120),
    period_end: addDaysToDate(semStart, 60),
    amount_paise: 40000000,
    notes: 'Approved in the July GBM.',
    created_by: ravi.id,
  });

  const receiptId = await stubReceipt(knex, sky.id, ravi.id, 'sound-invoice.pdf');
  const [paidExpense] = await knex('expenses')
    .insert({
      club_id: sky.id,
      kind: 'DIRECT',
      title: 'Sound system rental',
      description: 'DJ console + speakers for Freshers night',
      amount_paise: 1800000,
      incurred_on: dateOnly(daysFromNow(-32)),
      event_id: freshers.id,
      receipt_file_id: receiptId,
      submitted_by: ravi.id,
      status: 'PAID',
      paid_by: ravi.id,
      paid_at: daysFromNow(-30, 15),
      payout_reference: 'UPI-482910',
    })
    .returning('*');
  await knex('financial_transactions').insert({
    club_id: sky.id,
    direction: 'OUT',
    category: 'DIRECT_EXPENSE',
    amount_paise: 1800000,
    source_type: 'EXPENSE',
    source_id: paidExpense.id,
    expense_id: paidExpense.id,
    event_id: freshers.id,
    recorded_by: ravi.id,
    reference: 'UPI-482910',
    description: 'Sound system rental',
    occurred_at: daysFromNow(-30, 15),
  });

  const pendingReceipt = await stubReceipt(knex, sky.id, karthik.id);
  await knex('expenses').insert({
    club_id: sky.id,
    kind: 'REIMBURSEMENT',
    title: 'Lanyards & badges',
    description: '300 lanyards for Tech Fest',
    amount_paise: 420000,
    incurred_on: dateOnly(daysFromNow(-1)),
    event_id: techFest.id,
    receipt_file_id: pendingReceipt,
    submitted_by: karthik.id,
    payee_user_id: karthik.id,
    status: 'SUBMITTED',
  });

  // eslint-disable-next-line no-console
  console.log('[seed] Demo engagement data loaded (password: demo1234)');
}
