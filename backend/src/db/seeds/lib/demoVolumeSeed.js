/**
 * Reviewer-scale demo data (~100 rows in major tables). Runs after 002_demo_engagement.
 * Idempotent: skips when volume users already exist.
 */
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import {
  CORE_TEAM_EMAILS,
  DEMO_PASSWORD,
  activateMembership,
  insertUser,
  seedTicketBooking,
  stubReceipt,
} from './demoEngagementSeed.js';
import {
  COLLEGE_DOMAIN,
  STUDENT_FIRST,
  STUDENT_LAST,
  studentEmail,
  studentRoll,
} from './demoSeedConstants.js';
import { addDaysToDate, todayIST } from '../../../shared/clock.js';
import { daysFromNow, dateOnly } from './seedTime.js';
import { pickupCode, randomReference, randomToken } from '../../../shared/tokens.js';

const TARGET_VOLUME_USERS = 80;
const DEPT_CODES = ['CS', 'ME', 'EE', 'IT', 'CE', 'EC'];
const EVENT_SPECS = [
  { title: 'Guest lecture: campus startups', description: 'Founders from last year’s incubation cohort share how they went from club projects to registered companies.' },
  { title: '24-hour hackathon — Skyline edition', description: 'Teams of four; themes drop at kickoff. Food, mentors, and judging in the main auditorium.' },
  { title: 'UI/UX design critique night', description: 'Bring Figma links or paper wireframes. Seniors and club mentors give structured feedback.' },
  { title: 'Acoustic open mic', description: 'Sign up at the desk by 5 PM. Originals and covers welcome; backline provided.' },
  { title: 'Inter-department sports meet', description: 'Cricket and volleyball brackets; faculty referees; medals at closing ceremony.' },
  { title: 'Alumni networking breakfast', description: 'RSVP required. Round-table conversations by branch and graduating year.' },
  { title: 'On-campus recruitment drive — day 1', description: 'Resume clinic in the morning; employer booths open from 11 AM in the convention hall.' },
  { title: 'Community clean-up & tree planting', description: 'Meet at the north gate; gloves and saplings supplied. Service hours logged for NSS.' },
  { title: 'Friday open mic & poetry', description: 'Hosted by the literary cell; five-minute slots, no registration fee.' },
  { title: 'Inter-college quiz — preliminary', description: 'Written round; top six teams advance to the stage finals next month.' },
  { title: 'Robotics club showcase', description: 'Demo day for line followers, maze solvers, and the new arm prototype.' },
  { title: 'Annual photo exhibition opening', description: 'Prints from the semester’s photo walks; sales support society equipment fund.' },
];
const ANNOUNCEMENT_SNIPPETS = [
  'General body meeting this Thursday at 5:30 PM in Seminar Hall 2. Agenda: fest budget and volunteer roster.',
  'Membership renewals for the annual plan close on the 15th. Autopay members are charged automatically on expiry.',
  'Workshop registration for the guest lecture opens tomorrow at 10 AM on the events page.',
  'Merch pickup for paid orders is at the Skyline office, ground floor, 12–4 PM on weekdays.',
  'Photography society darkroom slots for next week are posted in the members channel.',
  'Treasurer’s office hours: Tuesdays 2–4 PM for reimbursement questions and receipt uploads.',
  'Robotics lab access cards must be returned before the mid-sem break; see the club head for extensions.',
  'Volunteer shift sign-up for the sports meet is live — at least one shift required for event staff badge.',
];
const MERCH_ITEMS = [
  { name: 'Skyline fest tee — charcoal', description: 'Unisex fit; skyline silhouette print; sizes S–XL.' },
  { name: 'Association hoodie — navy', description: 'Embroidered logo; fleece-lined; member pricing applies.' },
  { name: 'Campus notebook set', description: 'A5 ruled, 3-pack; sold at cost for orientation week.' },
  { name: 'Reusable water bottle', description: 'Steel 750 ml; BPA-free; pick up with fest registration.' },
  { name: 'Limited alumni reunion cap', description: 'Pre-order only; expected dispatch before convocation week.' },
];
const FUNDRAISERS = [
  { name: 'Library extension fund', description: 'Reading room furniture and quiet-zone AC for the central library block.' },
  { name: 'Scholarship support drive', description: 'Need-based assistance for hostel and exam fees; audited disbursement.' },
  { name: 'Flood relief — partner NGO', description: 'On-campus collection matched by the alumni chapter up to ₹2 lakh.' },
  { name: 'Equipment grant — robotics lab', description: 'Motor controllers and sensors for inter-college competition season.' },
  { name: 'Annual day cultural fund', description: 'Stage, sound, and artist fees for the end-of-semester program.' },
];
const EXPENSE_TITLES = [
  'Auditorium rental — guest lecture',
  'Catering — alumni breakfast',
  'Printing — event posters and standees',
  'Transport — sports meet equipment',
  'Sound hire — open mic night',
  'Prizes — quiz preliminary',
  'Lab consumables — robotics showcase',
  'Frame mounts — photo exhibition',
  'First-aid kits — sports meet',
  'Banner fabric — recruitment drive',
];

export async function runDemoVolumeSeed(knex) {
  const sky = await knex('clubs').where({ slug: 'skyline' }).first();
  if (!sky) {
    // eslint-disable-next-line no-console
    console.log('[seed] 003_demo_volume skipped — run 002_demo_engagement first (no club skyline)');
    return;
  }

  const volumeMarker = await knex('fundraisers')
    .where({ club_id: sky.id, name: FUNDRAISERS[0].name })
    .first();
  if (volumeMarker) {
    // eslint-disable-next-line no-console
    console.log('[seed] Volume demo data already present — skipping 003_demo_volume');
    return;
  }

  await knex.transaction(async (trx) => {
    await seedVolume(trx, sky);
  });
}

async function seedVolume(knex, sky) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const asha = await knex('users').where({ email: 'asha@skyline.ac.in' }).first();
  const ravi = await knex('users').where({ email: 'ravi@skyline.ac.in' }).first();
  const meera = await knex('users').where({ email: 'meera@skyline.ac.in' }).first();
  const karthik = await knex('users').where({ email: 'karthik@skyline.ac.in' }).first();
  if (!asha || !ravi) throw new Error('Core demo users missing — run npm run seed (002) first');

  const robo = await knex('clubs').where({ slug: 'robotics' }).first();
  const photo = await knex('clubs').where({ slug: 'photography' }).first();
  const skySem = await knex('membership_plans')
    .where({ club_id: sky.id, name: 'Semester', status: 'ACTIVE' })
    .first();
  const skyAnnual = await knex('membership_plans')
    .where({ club_id: sky.id, name: 'Annual', status: 'ACTIVE' })
    .first();
  const roboPlan = robo
    ? await knex('membership_plans').where({ club_id: robo.id, status: 'ACTIVE' }).first()
    : null;

  const volumeUsers = [];
  for (let i = 0; i < TARGET_VOLUME_USERS; i += 1) {
    const first = STUDENT_FIRST[(i + 3) % STUDENT_FIRST.length];
    const last = STUDENT_LAST[(i * 11) % STUDENT_LAST.length];
    const fullName = `${first} ${last}`;
    volumeUsers.push(
      await insertUser(knex, {
        email: studentEmail(first, last, i > 0 ? String(i) : ''),
        fullName,
        passwordHash,
        verified: i % 5 !== 0,
        studentIdentifier: studentRoll(2024, DEPT_CODES[i % DEPT_CODES.length], i + 1),
      }),
    );
  }

  for (let i = 0; i < volumeUsers.length; i += 1) {
    const u = volumeUsers[i];
    const plan = i % 2 === 0 ? skyAnnual : skySem;
    if (!plan) continue;
    await activateMembership(knex, {
      userId: u.id,
      clubId: sky.id,
      plan,
      daysAgo: 5 + (i % 200),
      prefix: 'SKY',
    });
    if (robo && roboPlan && i % 7 === 0) {
      await activateMembership(knex, {
        userId: u.id,
        clubId: robo.id,
        plan: roboPlan,
        daysAgo: 20 + (i % 100),
        prefix: 'ROB',
      });
    }
  }

  const memberships = await knex('memberships').where({ club_id: sky.id }).select('id', 'user_id', 'expires_on');
  for (let i = 0; i < Math.min(25, memberships.length); i += 1) {
    const m = memberships[i];
    await knex('renewal_attempts')
      .insert({
        membership_id: m.id,
        for_expires_on: m.expires_on,
        status: ['SUCCEEDED', 'FAILED', 'SKIPPED', 'PENDING'][i % 4],
        skip_reason: i % 4 === 3 ? 'AUTOPAY_DISABLED' : null,
        created_at: daysFromNow(-(i % 30)),
      })
      .onConflict(['membership_id', 'for_expires_on'])
      .ignore();
  }

  const clubs = [sky, robo, photo].filter(Boolean);
  const extraEvents = [];
  for (let i = 0; i < 12; i += 1) {
    const club = clubs[i % clubs.length];
    const head =
      club.id === sky.id ? asha : club.id === robo?.id ? await knex('users').where({ email: 'vikram@skyline.ac.in' }).first() : karthik;
    const days = -40 + i * 7;
    const status = i % 5 === 0 ? 'COMPLETED' : i % 7 === 0 ? 'DRAFT' : 'PUBLISHED';
    const spec = EVENT_SPECS[i % EVENT_SPECS.length];
    const [ev] = await knex('events')
      .insert({
        club_id: club.id,
        created_by: head?.id ?? asha.id,
        title: spec.title,
        description: spec.description,
        venue: `Hall ${(i % 5) + 1}`,
        capacity: 80 + (i % 5) * 20,
        member_price_paise: 5000 + (i % 4) * 2500,
        non_member_price_paise: 10000 + (i % 4) * 2500,
        registration_opens_at: daysFromNow(days - 14),
        registration_closes_at: daysFromNow(days + 5),
        starts_at: daysFromNow(days + 7, 10 + (i % 3)),
        ends_at: daysFromNow(days + 7, 16),
        status,
        published_at: status !== 'DRAFT' ? daysFromNow(days - 10) : null,
        completed_at: status === 'COMPLETED' ? daysFromNow(days + 8) : null,
        seats_reserved: 0,
        early_bird_reserved: 0,
        member_discount_eligible: true,
      })
      .returning('*');
    extraEvents.push(ev);
    await knex('event_organizers').insert({
      event_id: ev.id,
      user_id: karthik?.id ?? asha.id,
      assigned_by: asha.id,
    });
    if (meera) {
      await knex('event_staff').insert({
        event_id: ev.id,
        user_id: meera.id,
        club_id: club.id,
        assigned_by: asha.id,
      });
    }
  }

  const allUsers = [...volumeUsers];
  const coreUsers = await knex('users').whereIn('email', CORE_TEAM_EMAILS);
  allUsers.push(...coreUsers);

  for (const ev of extraEvents) {
    if (ev.status === 'DRAFT') continue;
    const ticketTarget = ev.status === 'COMPLETED' ? 18 : 12;
    for (let j = 0; j < ticketTarget; j += 1) {
      const u = allUsers[j % allUsers.length];
      const member = j % 4 !== 0;
      const price = member ? Number(ev.member_price_paise) : Number(ev.non_member_price_paise);
      await seedTicketBooking(knex, {
        event: ev,
        userId: u.id,
        buyerType: member ? 'MEMBER' : 'NON_MEMBER',
        finalPaise: price,
        usesEarlyBird: j % 6 === 0,
        at: daysFromNow(-30 + j, 11),
        confirmed: j % 11 !== 10,
      });
    }
    if (ev.status === 'COMPLETED') {
      const tickets = await knex('tickets').where({ event_id: ev.id, status: 'VALID' }).limit(12);
      for (let k = 0; k < tickets.length; k += 1) {
        const usedAt = daysFromNow(-20 + k, 18);
        await knex('tickets').where({ id: tickets[k].id }).update({
          status: 'USED',
          used_at: usedAt,
          used_by: meera?.id ?? asha.id,
        });
        await knex('check_ins').insert({
          ticket_id: tickets[k].id,
          event_id: ev.id,
          checked_in_by: meera?.id ?? asha.id,
          checked_in_at: usedAt,
        });
      }
    }
  }

  const annCategories = ['GENERAL', 'MEETING', 'DEADLINE', 'EVENT', 'SCHEDULE_CHANGE'];
  for (let i = 0; i < 28; i += 1) {
    const published = i % 4 !== 0;
    await knex('announcements').insert({
      club_id: sky.id,
      title: i % 3 === 0 ? 'Schedule change' : i % 3 === 1 ? 'Members-only notice' : 'Skyline update',
      body: ANNOUNCEMENT_SNIPPETS[i % ANNOUNCEMENT_SNIPPETS.length],
      category: annCategories[i % annCategories.length],
      audience: i % 3 === 0 ? 'PUBLIC' : 'MEMBERS',
      send_email: i % 5 !== 0,
      status: published ? 'PUBLISHED' : 'DRAFT',
      created_by: asha.id,
      published_by: published ? asha.id : null,
      published_at: published ? daysFromNow(-(i % 40), 12) : null,
      event_id: i % 6 === 0 && extraEvents[i % extraEvents.length] ? extraEvents[i % extraEvents.length].id : null,
    });
  }

  let apparel = await knex('product_categories').where({ club_id: sky.id, name: 'Apparel' }).first();
  if (!apparel) {
    [apparel] = await knex('product_categories').insert({ club_id: sky.id, name: 'Apparel' }).returning('*');
  }
  const merchProducts = [];
  for (let p = 0; p < 5; p += 1) {
    const merch = MERCH_ITEMS[p % MERCH_ITEMS.length];
    const [product] = await knex('products')
      .insert({
        club_id: sky.id,
        category_id: apparel.id,
        name: merch.name,
        description: merch.description,
        price_paise: 49900 + p * 5000,
        status: p === 4 ? 'DRAFT' : 'ACTIVE',
        created_by: asha.id,
      })
      .returning('*');
    merchProducts.push(product);
    for (const size of ['S', 'M', 'L', 'XL']) {
      const stock = 5 + ((p + size.charCodeAt(0)) % 30);
      const [variant] = await knex('product_variants')
        .insert({
          product_id: product.id,
          club_id: sky.id,
          size_label: size,
          stock_on_hand: stock,
          low_stock_threshold: 8,
        })
        .returning('*');
      await knex('stock_movements').insert({
        variant_id: variant.id,
        club_id: sky.id,
        type: 'RESTOCK',
        quantity: stock,
        reason: 'Opening stock — semester merch drop',
        actor_user_id: asha.id,
      });
      if (stock <= 8) {
        await knex('low_stock_alerts').insert({
          variant_id: variant.id,
          club_id: sky.id,
          status: 'OPEN',
          available_at_trigger: stock,
          threshold_at_trigger: 8,
        });
      }
    }
  }

  const variants = await knex('product_variants').where({ club_id: sky.id, is_active: true }).limit(40);
  const orderStatuses = ['PICKED_UP', 'CONFIRMED', 'PENDING_PAYMENT', 'CANCELLED'];
  for (let o = 0; o < 35; o += 1) {
    const u = volumeUsers[o % volumeUsers.length];
    const variant = variants[o % variants.length];
    if (!variant) break;
    const product = await knex('products').where({ id: variant.product_id }).first();
    const qty = 1 + (o % 2);
    const unit = Number(product.price_paise);
    const discount = o % 3 === 0 ? Math.floor(unit * 0.1) : 0;
    const total = (unit - discount) * qty;
    const status = orderStatuses[o % orderStatuses.length];
    const [order] = await knex('orders')
      .insert({
        club_id: sky.id,
        user_id: u.id,
        status,
        buyer_type: 'MEMBER',
        subtotal_paise: unit * qty,
        discount_paise: discount * qty,
        total_paise: total,
        pricing_mode: 'BEST_OF',
        pickup_code: ['CONFIRMED', 'PICKED_UP'].includes(status) ? pickupCode() : null,
        hold_expires_at: status === 'PENDING_PAYMENT' ? daysFromNow(0, 20) : null,
        confirmed_at: ['CONFIRMED', 'PICKED_UP'].includes(status) ? daysFromNow(-(o % 20), 14) : null,
        picked_up_at: status === 'PICKED_UP' ? daysFromNow(-(o % 15), 16) : null,
        picked_up_by: status === 'PICKED_UP' ? asha.id : null,
        cancelled_at: status === 'CANCELLED' ? daysFromNow(-(o % 5), 12) : null,
        cancel_reason: status === 'CANCELLED' ? 'USER_CANCELLED' : null,
      })
      .returning('*');
    await knex('order_items').insert({
      order_id: order.id,
      club_id: sky.id,
      product_id: product.id,
      variant_id: variant.id,
      quantity: qty,
      unit_list_price_paise: unit,
      unit_discount_paise: discount,
      unit_final_price_paise: unit - discount,
      line_total_paise: total,
      price_rule: discount ? 'MEMBER_DISCOUNT' : 'LIST',
    });
    if (status === 'PICKED_UP') {
      const [pay] = await knex('payments')
        .insert({
          club_id: sky.id,
          user_id: u.id,
          purpose: 'MERCH_ORDER',
          order_id: order.id,
          amount_paise: total,
          method: 'SIMULATED',
          is_simulated: true,
          status: 'SUCCEEDED',
          reference: randomReference('SIM'),
          settled_at: order.confirmed_at,
        })
        .returning('*');
      await knex('financial_transactions').insert({
        club_id: sky.id,
        direction: 'IN',
        category: 'MERCH_SALE',
        amount_paise: total,
        source_type: 'PAYMENT',
        source_id: pay.id,
        payment_id: pay.id,
        order_id: order.id,
        payer_user_id: u.id,
        reference: pay.reference,
        description: `Merchandise order ${order.pickup_code}`,
        occurred_at: order.confirmed_at,
      });
    }
  }

  for (let f = 0; f < FUNDRAISERS.length; f += 1) {
    const fundSpec = FUNDRAISERS[f];
    const [fund] = await knex('fundraisers')
      .insert({
        club_id: sky.id,
        name: fundSpec.name,
        description: fundSpec.description,
        starts_on: dateOnly(daysFromNow(-30 - f * 5)),
        target_date: dateOnly(daysFromNow(20 + f * 10)),
        goal_amount_paise: 2000000 + f * 500000,
        status: f === 4 ? 'COMPLETED' : 'ACTIVE',
        created_by: asha.id,
      })
      .returning('*');
    for (let t = 0; t < 6; t += 1) {
      await knex('fundraiser_tasks').insert({
        fundraiser_id: fund.id,
        club_id: sky.id,
        title: `Task ${t + 1} — ${fund.name}`,
        assignee_user_id: [ravi.id, meera?.id, karthik?.id][t % 3],
        deadline: daysFromNow(5 + t * 4, 17),
        status: ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'][t % 4],
        progress_percent: [0, 40, 100, 20][t % 4],
        created_by: asha.id,
      });
    }
    for (let inc = 0; inc < 8; inc += 1) {
      const amount = 500000 + inc * 25000;
      const received = daysFromNow(-25 + inc * 3);
      const entryId = crypto.randomUUID();
      await knex('financial_transactions').insert({
        club_id: sky.id,
        direction: 'IN',
        category: 'FUNDRAISER_INCOME',
        amount_paise: amount,
        source_type: 'INCOME_ENTRY',
        source_id: entryId,
        fundraiser_id: fund.id,
        recorded_by: ravi.id,
        description: `Cash collection batch ${inc + 1}`,
        reference: randomReference('FND'),
        occurred_at: received,
      });
    }
  }

  const semStart = todayIST();
  await knex('budgets').insert({
    club_id: sky.id,
    name: 'Even semester outreach',
    period_start: addDaysToDate(semStart, -60),
    period_end: addDaysToDate(semStart, 120),
    amount_paise: 25000000,
    notes: 'Even semester outreach, workshops, and inter-college travel.',
    created_by: ravi.id,
  });

  const expenseStatuses = ['SUBMITTED', 'APPROVED', 'PAID', 'REJECTED'];
  const sampleEvents = await knex('events').where({ club_id: sky.id }).limit(8);
  for (let e = 0; e < 40; e += 1) {
    const status = expenseStatuses[e % expenseStatuses.length];
    const receiptId = await stubReceipt(knex, sky.id, ravi.id, `receipt-${e}.pdf`);
    const amount = 150000 + (e % 20) * 25000;
    const ev = sampleEvents[e % sampleEvents.length];
    const row = {
      club_id: sky.id,
      kind: e % 3 === 0 ? 'DIRECT' : 'REIMBURSEMENT',
      title: EXPENSE_TITLES[e % EXPENSE_TITLES.length],
      description: 'Submitted with receipt; routed to treasurer for approval.',
      amount_paise: amount,
      incurred_on: dateOnly(daysFromNow(-(e % 45))),
      event_id: e % 2 === 0 ? ev?.id : null,
      receipt_file_id: receiptId,
      submitted_by: karthik?.id ?? ravi.id,
      payee_user_id: karthik?.id ?? ravi.id,
      status,
    };
    if (status === 'APPROVED' || status === 'PAID' || status === 'REJECTED') {
      row.decided_by = ravi.id;
      row.decided_at = daysFromNow(-(e % 10));
      row.decision_note = status === 'REJECTED' ? 'Receipt unclear — please re-upload' : null;
    }
    if (status === 'PAID') {
      row.paid_by = ravi.id;
      row.paid_at = daysFromNow(-(e % 8));
      row.payout_reference = randomReference('UPI');
    }
    const [exp] = await knex('expenses').insert(row).returning('*');
    if (status === 'PAID') {
      await knex('financial_transactions').insert({
        club_id: sky.id,
        direction: 'OUT',
        category: row.kind === 'DIRECT' ? 'DIRECT_EXPENSE' : 'REIMBURSEMENT_PAYOUT',
        amount_paise: amount,
        source_type: 'EXPENSE',
        source_id: exp.id,
        expense_id: exp.id,
        event_id: row.event_id,
        recorded_by: ravi.id,
        reference: row.payout_reference,
        description: row.title,
        occurred_at: row.paid_at,
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[seed] Campus volume data loaded: +${TARGET_VOLUME_USERS} students @${COLLEGE_DOMAIN}, events, tickets, orders, expenses, fundraisers (password: ${DEMO_PASSWORD})`,
  );
}
