// Demo seed. Every money movement is produced through ops.js (book → settle, order → settle,
// join → settle, expense → paid) so the ledger reconciles exactly like the real backend.
import { activeBenefits, daysFromNow, discount, uid } from './domain';
import { bookEvent, enqueue, evaluateLowStock, moveStock, placeOrder, postLedger, settlePayment, startMembershipTerm } from './ops';

/** Keep in sync with backend `src/db/seeds/lib/demoEngagementSeed.js` (live mode). */
export const DEMO_PASSWORD = 'demo1234';

const FIRST = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Ishaan', 'Saanvi', 'Arjun', 'Kavya', 'Rohan', 'Nisha', 'Aditya', 'Pooja', 'Siddharth', 'Lakshmi', 'Varun', 'Sneha', 'Rahul', 'Divya', 'Nikhil', 'Harini', 'Tarun', 'Bhavya', 'Kiran', 'Swathi', 'Manoj', 'Keerthi', 'Pranav', 'Yamini', 'Gautham', 'Ritika', 'Sai', 'Teja', 'Akhil', 'Sravya', 'Naveen', 'Mounika'];
const LAST = ['Sharma', 'Reddy', 'Iyer', 'Varma', 'Naidu', 'Menon', 'Rao', 'Pillai', 'Gupta', 'Das', 'Chowdary', 'Krishnan'];

export function createSeed() {
  const db = {
    users: [], verifications: [], clubs: [], roles: [], plans: [], memberships: [], terms: [], autopayConsents: [], renewalAttempts: [],
    events: [], organizers: [], staff: [], bookings: [], tickets: [], checkIns: [], announcements: [], deliveries: [],
    categories: [], products: [], variants: [], movements: [], alerts: [], orders: [], orderItems: [],
    fundraisers: [], tasks: [], payments: [], ledger: [], expenses: [], budgets: [], files: [], audit: [], idempotency: {},
    studentFixtures: [],
  };

  /* ── Users ── */
  const mkUser = (fullName, email, { phone = '+9198' + String(Math.floor(10000000 + Math.random() * 89999999)), verified = true, studentId } = {}) => {
    const u = { id: uid('usr'), fullName, email, phoneE164: phone, isActive: true, createdAt: daysFromNow(-300) };
    db.users.push(u);
    if (verified) {
      const sid = studentId || `SKY2023${String(db.users.length).padStart(4, '0')}`;
      db.verifications.push({ id: uid('ver'), userId: u.id, outcome: 'VERIFIED', adapter: 'mock', checkedAt: daysFromNow(-280), supersededAt: null });
      db.studentFixtures.push({ studentIdentifier: sid, fullName, linkedUserId: u.id });
    }
    return u;
  };
  const asha = mkUser('Asha Rao', 'asha@skyline.ac.in', { studentId: 'SKY2023CS001' });
  const ravi = mkUser('Ravi Kumar', 'ravi@skyline.ac.in', { studentId: 'SKY2022ME042' });
  const meera = mkUser('Meera Iyer', 'meera@skyline.ac.in', { studentId: 'SKY2023EE056' });
  const karthik = mkUser('Karthik Reddy', 'karthik@skyline.ac.in', { studentId: 'SKY2023IT088' });
  const priya = mkUser('Priya Nair', 'priya.nair@gmail.com', { verified: false, phone: null });
  const vikram = mkUser('Vikram Shetty', 'vikram@skyline.ac.in', { studentId: 'SKY2023CE044' });
  const others = [];
  for (let i = 0; i < 36; i += 1) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const name = `${first} ${last}`;
    const local = `${first}.${last}${i > 0 ? i : ''}`.toLowerCase().replace(/[^a-z0-9.]/g, '');
    others.push(mkUser(name, `${local}@skyline.ac.in`, { phone: i % 9 === 0 ? null : undefined }));
  }
  // Unlinked fixtures so new registrations can verify in the demo.
  db.studentFixtures.push({ studentIdentifier: 'SKY2024EC017', fullName: 'Priya Nair', linkedUserId: null });
  db.studentFixtures.push({ studentIdentifier: 'SKY2025ME042', fullName: 'Arun Menon', linkedUserId: null });

  /* ── Clubs & roles ── */
  const mkClub = (name, slug, memberPrefix, description) => {
    const c = { id: uid('club'), name, slug, memberPrefix, description, contactEmail: slug === 'skyline' ? 'office@skyline.ac.in' : `${slug}@skyline.ac.in`, isActive: true, nextMemberSeq: 1 };
    db.clubs.push(c);
    return c;
  };
  const sky = mkClub('Skyline Student Association', 'skyline', 'SKY', 'The college-wide student association: fests, workshops, welfare drives and the semester merch drop.');
  const robo = mkClub('Robotics Club', 'robotics', 'ROB', 'Build nights, line-follower races and the inter-college robotics league.');
  const photo = mkClub('Photography Society', 'photography', 'PHO', 'Photo walks, editing workshops and the annual campus exhibition.');

  const role = (club, user, r, by = asha) => db.roles.push({ id: uid('role'), clubId: club.id, userId: user.id, role: r, assignedBy: by.id, assignedAt: daysFromNow(-200), revokedAt: null });
  role(sky, asha, 'CLUB_HEAD');
  role(sky, ravi, 'TREASURER');
  role(sky, meera, 'VOLUNTEER');
  role(sky, others[0], 'VOLUNTEER');
  role(sky, others[1], 'VOLUNTEER');
  role(sky, others[2], 'VOLUNTEER');
  role(robo, vikram, 'CLUB_HEAD', vikram);
  role(robo, asha, 'VOLUNTEER', vikram);
  role(robo, karthik, 'TREASURER', vikram);
  role(photo, karthik, 'CLUB_HEAD', karthik);

  /* ── Plans ── */
  const mkPlan = (club, p) => {
    const plan = { id: uid('plan'), clubId: club.id, status: 'ACTIVE', createdAt: daysFromNow(-320), ...p };
    db.plans.push(plan);
    return plan;
  };
  const skySem = mkPlan(sky, { name: 'Semester', description: 'Six months of membership for one semester.', benefitsText: '10% off event tickets\n5% off merchandise', feePaise: 30000, durationMonths: 6, eventDiscountBps: 1000, merchDiscountBps: 500, earlyBirdAccess: false });
  const skyAnnual = mkPlan(sky, { name: 'Annual', description: 'Full academic year with early access to popular events.', benefitsText: '15% off event tickets\n10% off merchandise\nEarly access to registrations', feePaise: 50000, durationMonths: 12, eventDiscountBps: 1500, merchDiscountBps: 1000, earlyBirdAccess: true });
  mkPlan(sky, { name: 'Founders 2025', description: 'Launch offer for the first batch.', benefitsText: '20% off everything', feePaise: 25000, durationMonths: 12, eventDiscountBps: 2000, merchDiscountBps: 2000, earlyBirdAccess: true, status: 'ARCHIVED' });
  const roboStd = mkPlan(robo, { name: 'Builder', description: 'Lab access and league registration.', benefitsText: 'Free build nights\n10% off kits', feePaise: 40000, durationMonths: 12, eventDiscountBps: 1000, merchDiscountBps: 1000, earlyBirdAccess: true });
  mkPlan(photo, { name: 'Shutterbug', description: 'Walks, workshops and exhibition entry.', benefitsText: 'Free photo walks\n10% off prints', feePaise: 20000, durationMonths: 6, eventDiscountBps: 1000, merchDiscountBps: 1000, earlyBirdAccess: false });

  const join = (user, club, plan, daysAgo, outcome = 'SUCCEEDED') => {
    const at = daysFromNow(-daysAgo, 11);
    const { payment } = startMembershipTerm(db, { userId: user.id, club, plan, kind: 'JOIN', at });
    if (payment && outcome) settlePayment(db, payment, outcome, { at });
  };
  join(asha, sky, skyAnnual, 120);
  join(ravi, sky, skyAnnual, 118);
  join(meera, sky, skySem, 100);
  join(karthik, sky, skyAnnual, 90);
  join(vikram, robo, roboStd, 150);
  join(asha, robo, roboStd, 140);
  others.forEach((u, i) => {
    if (i % 6 === 5) return; // some students are not members
    const annual = i % 3 === 0;
    let daysAgo = 10 + ((i * 13) % 160);
    if (i === 7 || i === 13) daysAgo = 177; // semester members expiring within 7 days
    if (i === 19 || i === 25) daysAgo = 200; // lapsed
    join(u, sky, annual && i !== 7 && i !== 13 && i !== 19 && i !== 25 ? skyAnnual : skySem, daysAgo);
    if (i % 4 === 0) join(u, robo, roboStd, 30 + i);
  });
  // A failed and a pending join attempt for realism.
  join(others[5], sky, skySem, 3, 'FAILED');
  join(others[11], sky, skyAnnual, 0, null);
  // AutoPay consent for Asha.
  const ashaMem = db.memberships.find((m) => m.userId === asha.id && m.clubId === sky.id);
  ashaMem.autopayEnabled = true;
  ashaMem.autopayPlanId = skyAnnual.id;
  ashaMem.autopayAmountPaise = skyAnnual.feePaise;
  db.autopayConsents.push({ id: uid('apc'), membershipId: ashaMem.id, status: 'ENABLED', planId: skyAnnual.id, consentedAmountPaise: skyAnnual.feePaise, consentTextVersion: 'v1', createdAt: daysFromNow(-60) });

  /* ── Events ── */
  const mkEvent = (club, e) => {
    const ev = {
      id: uid('evt'), clubId: club.id, status: 'PUBLISHED', seatsReserved: 0, earlyBirdReserved: 0, memberDiscountEligible: true,
      earlyAccessOpensAt: null, earlyBirdEndsAt: null, earlyBirdMemberPricePaise: null, earlyBirdNonMemberPricePaise: null, earlyBirdQuantity: null,
      createdAt: daysFromNow(-60), cancelReason: null, ...e,
    };
    db.events.push(ev);
    return ev;
  };
  const techFest = mkEvent(sky, {
    title: 'Skyline Tech Fest 2026', description: 'Two days of talks, project expo and the inter-department coding sprint. Lunch included both days.',
    venue: 'Main Auditorium & CSE Block', capacity: 300, memberPricePaise: 20000, nonMemberPricePaise: 35000,
    earlyBirdMemberPricePaise: 15000, earlyBirdNonMemberPricePaise: 28000, earlyBirdQuantity: 80, earlyBirdEndsAt: daysFromNow(6),
    earlyAccessOpensAt: daysFromNow(-30), registrationOpensAt: daysFromNow(-25), registrationClosesAt: daysFromNow(19), startsAt: daysFromNow(20, 9), endsAt: daysFromNow(21, 18),
  });
  const freshers = mkEvent(sky, {
    title: "Freshers' Welcome Night", description: 'Music, games and introductions for the incoming batch.', venue: 'Open Air Theatre',
    capacity: 220, memberPricePaise: 10000, nonMemberPricePaise: 15000, registrationOpensAt: daysFromNow(-60), registrationClosesAt: daysFromNow(-31), startsAt: daysFromNow(-30, 18), endsAt: daysFromNow(-30, 22),
  });
  const hack = mkEvent(sky, {
    title: '24h Campus Hackathon', description: 'Members-only overnight hackathon. Teams of up to four; mentors from alumni startups.', venue: 'Innovation Lab',
    capacity: 60, memberPricePaise: 0, nonMemberPricePaise: null, registrationOpensAt: daysFromNow(-5), registrationClosesAt: daysFromNow(9), startsAt: daysFromNow(10, 9), endsAt: daysFromNow(11, 9),
  });
  mkEvent(sky, {
    title: 'Startup Pitch Workshop', description: 'Learn to write a 3-minute pitch with feedback from the incubation cell.', venue: 'Seminar Hall 2', status: 'DRAFT',
    capacity: 80, memberPricePaise: 5000, nonMemberPricePaise: 10000, registrationOpensAt: daysFromNow(5), registrationClosesAt: daysFromNow(29), startsAt: daysFromNow(30, 14), endsAt: daysFromNow(30, 17),
  });
  mkEvent(sky, {
    title: 'Monsoon Film Screening', description: 'Cancelled due to auditorium maintenance.', venue: 'Main Auditorium', status: 'CANCELLED', cancelReason: 'Venue unavailable',
    capacity: 150, memberPricePaise: 3000, nonMemberPricePaise: 5000, registrationOpensAt: daysFromNow(-20), registrationClosesAt: daysFromNow(-2), startsAt: daysFromNow(-1, 18), endsAt: daysFromNow(-1, 21),
  });
  const roboRace = mkEvent(robo, {
    title: 'Line Follower Race', description: 'Bring your bot. Three heats, fastest clean lap wins.', venue: 'Mech Workshop',
    capacity: 40, memberPricePaise: 5000, nonMemberPricePaise: 12000, registrationOpensAt: daysFromNow(-10), registrationClosesAt: daysFromNow(13), startsAt: daysFromNow(14, 10), endsAt: daysFromNow(14, 16),
  });
  mkEvent(photo, {
    title: 'Golden Hour Photo Walk', description: 'Walk around the lake campus at sunset.', venue: 'Main Gate', capacity: 30, memberPricePaise: 0, nonMemberPricePaise: 5000,
    registrationOpensAt: daysFromNow(-3), registrationClosesAt: daysFromNow(6), startsAt: daysFromNow(7, 17), endsAt: daysFromNow(7, 19),
  });
  db.organizers.push({ eventId: techFest.id, userId: karthik.id }, { eventId: freshers.id, userId: karthik.id }, { eventId: hack.id, userId: meera.id }, { eventId: roboRace.id, userId: vikram.id });
  db.staff.push({ eventId: techFest.id, userId: meera.id }, { eventId: techFest.id, userId: others[0].id }, { eventId: freshers.id, userId: meera.id }, { eventId: hack.id, userId: others[1].id });

  const seedQuote = (ev, user, useEb) => {
    const b = activeBenefits(db, user.id, ev.clubId);
    const isMember = !!b;
    if (!isMember && ev.nonMemberPricePaise == null) return null;
    if (useEb && (isMember ? ev.earlyBirdMemberPricePaise : ev.earlyBirdNonMemberPricePaise) != null && ev.earlyBirdReserved < (ev.earlyBirdQuantity || 0)) {
      const p = isMember ? ev.earlyBirdMemberPricePaise : ev.earlyBirdNonMemberPricePaise;
      return { buyerType: isMember ? 'MEMBER' : 'NON_MEMBER', priceTier: isMember ? 'MEMBER_EARLY_BIRD' : 'NON_MEMBER_EARLY_BIRD', listPricePaise: p, discountPaise: 0, finalPricePaise: p, usesEarlyBird: true };
    }
    const base = isMember ? ev.memberPricePaise : ev.nonMemberPricePaise;
    const d = isMember ? discount(base, b.eventDiscountBps) : 0;
    return { buyerType: isMember ? 'MEMBER' : 'NON_MEMBER', priceTier: base - d === 0 ? 'FREE' : isMember ? 'MEMBER_REGULAR' : 'NON_MEMBER_REGULAR', listPricePaise: base, discountPaise: d, finalPricePaise: base - d, membershipTermId: b?.termId };
  };
  const book = (ev, user, daysAgo, { useEb = false, outcome = 'SUCCEEDED' } = {}) => {
    const quote = seedQuote(ev, user, useEb);
    if (!quote) return null;
    const at = daysFromNow(-daysAgo, 9 + (daysAgo % 9));
    const r = bookEvent(db, { userId: user.id, event: ev, quote, at });
    if (r.payment && outcome) settlePayment(db, r.payment, outcome, { at });
    return r;
  };
  const audience = [asha, ravi, meera, karthik, priya, vikram, ...others];
  // Freshers (completed): 30 attendees, mostly checked in.
  audience.slice(0, 32).forEach((u, i) => book(freshers, u, 40 + (i % 18)));
  // Tech Fest: early-bird + regular sales spread over the last 25 days.
  audience.slice(1, 40).forEach((u, i) => book(techFest, u, 1 + ((i * 5) % 24), { useEb: i < 22, outcome: i === 3 ? 'FAILED' : 'SUCCEEDED' }));
  book(techFest, others[34], 0, { outcome: null }); // a held seat awaiting payment
  // Hackathon (free, members only).
  audience.slice(2, 16).forEach((u, i) => book(hack, u, 1 + (i % 4)));
  // Robotics race.
  [vikram, asha, karthik, ...others.slice(0, 9)].forEach((u, i) => book(roboRace, u, 1 + (i % 8)));
  // Asha holds a Tech Fest ticket too (for the My tickets screen) — already booked above if in slice.
  if (!db.bookings.some((b) => b.userId === asha.id && b.eventId === techFest.id)) book(techFest, asha, 2, { useEb: true });

  freshers.status = 'COMPLETED';
  db.tickets.filter((t) => t.eventId === freshers.id).forEach((t, i) => {
    if (i % 7 === 6) return; // no-shows
    t.status = 'USED';
    t.usedAt = new Date(new Date(freshers.startsAt).getTime() + (i % 10) * 9 * 60000).toISOString();
    t.usedBy = meera.id;
    db.checkIns.push({ id: uid('chk'), ticketId: t.id, eventId: freshers.id, checkedInBy: meera.id, checkedInAt: t.usedAt });
  });

  /* ── Announcements ── */
  const mkAnn = (club, a, daysAgo) => {
    const an = { id: uid('ann'), clubId: club.id, eventId: null, audience: 'PUBLIC', sendEmail: true, status: 'PUBLISHED', createdBy: asha.id, publishedBy: asha.id, publishedAt: daysFromNow(-daysAgo, 12), createdAt: daysFromNow(-daysAgo - 1), ...a };
    if (an.status === 'DRAFT') {
      an.publishedAt = null;
      an.publishedBy = null;
    }
    db.announcements.push(an);
    if (an.status === 'PUBLISHED' && an.sendEmail) {
      const recipients = new Set(db.memberships.filter((m) => m.clubId === club.id && m.status === 'ACTIVE').map((m) => m.userId));
      if (an.eventId) db.tickets.filter((t) => t.eventId === an.eventId && t.status !== 'CANCELLED').forEach((t) => recipients.add(t.userId));
      [...recipients].forEach((userId) => enqueue(db, { userId, template: 'ANNOUNCEMENT', announcementId: an.id, payload: { title: an.title }, dedupeKey: `ann:${an.id}:${userId}` }));
    }
    return an;
  };
  mkAnn(sky, { title: 'Tech Fest early-bird tickets are live', body: 'Early-bird pricing is available for the first 80 tickets or until the deadline, whichever comes first.\n\nMembers on the Annual plan got early access last week.', category: 'EVENT', eventId: techFest.id }, 24);
  mkAnn(sky, { title: 'General body meeting on Friday, 4 PM', body: 'Agenda: semester calendar, merch drop, and volunteer sign-ups for the winter clothing drive.\nVenue: Seminar Hall 1.', category: 'MEETING', audience: 'MEMBERS' }, 9);
  mkAnn(sky, { title: 'Reimbursement deadline: 20th of this month', body: 'Submit all pending receipts for September events through the Expenses page before the 20th.', category: 'DEADLINE', audience: 'MEMBERS' }, 5);
  mkAnn(sky, { title: 'Hackathon venue moved to Innovation Lab', body: 'The hackathon has moved from the CSE lab to the Innovation Lab (Block C, 2nd floor). Timings are unchanged.', category: 'SCHEDULE_CHANGE', eventId: hack.id }, 2);
  mkAnn(sky, { title: 'Merch pickup desk timings', body: 'Draft. Confirm timings with the office before publishing.', category: 'GENERAL', status: 'DRAFT' }, 0);
  mkAnn(robo, { title: 'Build night every Thursday', body: 'The lab is open 6–10 PM every Thursday for members.', category: 'MEETING', createdBy: vikram.id, publishedBy: vikram.id }, 12);
  // A couple of failed deliveries to make the delivery report realistic.
  db.deliveries.filter((d) => d.template === 'ANNOUNCEMENT').slice(3, 5).forEach((d) => {
    d.status = 'FAILED';
    d.attempts = 3;
    d.lastError = 'Mailbox unavailable (simulated)';
  });

  /* ── Merchandise ── */
  const cat = (club, name) => {
    const c = { id: uid('cat'), clubId: club.id, name };
    db.categories.push(c);
    return c;
  };
  const apparel = cat(sky, 'Apparel');
  const accessories = cat(sky, 'Accessories');
  const roboKits = cat(robo, 'Kits');
  const mkProduct = (club, category, p, sizes) => {
    const product = { id: uid('prd'), clubId: club.id, categoryId: category.id, status: 'ACTIVE', memberDiscountEligible: true, availableToNonMembers: true, offerPricePaise: null, offerStartsAt: null, offerEndsAt: null, createdAt: daysFromNow(-90), ...p };
    db.products.push(product);
    sizes.forEach(([sizeLabel, stock, threshold = 5]) => {
      const v = { id: uid('var'), productId: product.id, clubId: club.id, sizeLabel, stockOnHand: stock, stockReserved: 0, lowStockThreshold: threshold, isActive: true };
      db.variants.push(v);
      moveStock(db, v, 'RESTOCK', stock, { reason: 'Initial stock', actorUserId: asha.id });
    });
    return product;
  };
  const hoodie = mkProduct(sky, apparel, { name: 'Skyline Hoodie', description: 'Heavyweight navy hoodie with embroidered logo.', pricePaise: 89900, offerPricePaise: 79900, offerStartsAt: daysFromNow(-3), offerEndsAt: daysFromNow(4) }, [['S', 14], ['M', 24], ['L', 22], ['XL', 5]]);
  const tee = mkProduct(sky, apparel, { name: 'Tech Fest 2026 T-shirt', description: 'Limited edition fest tee, 100% cotton.', pricePaise: 39900 }, [['S', 20], ['M', 30], ['L', 28], ['XL', 12], ['XXL', 6, 3]]);
  const cap = mkProduct(sky, accessories, { name: 'Embroidered Cap', description: 'Adjustable strap, one size.', pricePaise: 29900 }, [['ONE_SIZE', 18]]);
  const stickers = mkProduct(sky, accessories, { name: 'Sticker Pack', description: 'Ten die-cut vinyl stickers.', pricePaise: 9900, memberDiscountEligible: false }, [['ONE_SIZE', 60, 10]]);
  mkProduct(sky, accessories, { name: 'Members-only Tote', description: 'Canvas tote for members.', pricePaise: 24900, availableToNonMembers: false }, [['ONE_SIZE', 25]]);
  mkProduct(sky, apparel, { name: 'Varsity Jacket', description: 'Pre-order sample, not yet on sale.', pricePaise: 189900, status: 'DRAFT' }, [['M', 12, 2], ['L', 12, 2]]);
  mkProduct(robo, roboKits, { name: 'Line Follower Starter Kit', description: 'Chassis, motors, sensor array and driver board.', pricePaise: 149900 }, [['ONE_SIZE', 12, 3]]);

  const variantsOf = (p) => db.variants.filter((v) => v.productId === p.id);
  const merchQuote = (product, user) => {
    const b = activeBenefits(db, user.id, product.clubId);
    const d = b && product.memberDiscountEligible ? discount(product.pricePaise, b.merchDiscountBps) : 0;
    return { listPricePaise: product.pricePaise, discountPaise: d, finalPricePaise: product.pricePaise - d, priceRule: d ? 'MEMBER_DISCOUNT' : 'LIST' };
  };
  const order = (user, picks, daysAgo, outcome = 'SUCCEEDED', pickedUp = false) => {
    const at = daysFromNow(-daysAgo, 13);
    const lines = picks.map(([product, size, qty]) => ({ product, variant: variantsOf(product).find((v) => v.sizeLabel === size), quantity: qty, quote: merchQuote(product, user) }));
    const { order: o, payment } = placeOrder(db, { userId: user.id, clubId: product0(picks).clubId, lines, at });
    if (outcome) settlePayment(db, payment, outcome, { at });
    if (pickedUp && o.status === 'CONFIRMED') {
      o.status = 'PICKED_UP';
      o.pickedUpAt = daysFromNow(-daysAgo + 2, 15);
      o.pickedUpBy = asha.id;
    }
    return o;
  };
  function product0(picks) {
    return picks[0][0];
  }
  order(asha, [[hoodie, 'M', 1], [stickers, 'ONE_SIZE', 1]], 20, 'SUCCEEDED', true);
  order(ravi, [[tee, 'L', 2]], 18, 'SUCCEEDED', true);
  order(meera, [[hoodie, 'S', 1]], 6);
  order(karthik, [[cap, 'ONE_SIZE', 1], [tee, 'M', 1]], 4);
  order(priya, [[tee, 'S', 1]], 3, 'FAILED');
  others.slice(0, 22).forEach((u, i) => {
    const picks = [[[hoodie, ['S', 'M', 'L', 'XL'][i % 4], 1]], [[tee, ['M', 'L', 'XL', 'XXL'][i % 4], 1]], [[cap, 'ONE_SIZE', 1]], [[stickers, 'ONE_SIZE', 2]]][i % 4];
    order(u, picks, 1 + ((i * 3) % 40), i === 9 ? 'FAILED' : 'SUCCEEDED', i % 3 === 0);
  });
  order(others[23], [[hoodie, 'L', 1]], 0, null); // pending payment (stock reserved)
  db.variants.forEach((v) => evaluateLowStock(db, v));

  /* ── Fundraisers & tasks ── */
  const mkFund = (club, f) => {
    const fr = { id: uid('fnd'), clubId: club.id, createdBy: asha.id, createdAt: daysFromNow(-40), ...f };
    db.fundraisers.push(fr);
    return fr;
  };
  const dateOnly = (iso) => iso.slice(0, 10);
  const winter = mkFund(sky, { name: 'Winter Clothing Drive', description: 'Collect and distribute 500 warm clothing items to the nearby villages before December.', startsOn: dateOnly(daysFromNow(-20)), targetDate: dateOnly(daysFromNow(25)), goalAmountPaise: 5000000, status: 'ACTIVE' });
  const sponsor = mkFund(sky, { name: 'Tech Fest Sponsorship Drive', description: 'Secure title and associate sponsors for Tech Fest 2026.', startsOn: dateOnly(daysFromNow(-35)), targetDate: dateOnly(daysFromNow(8)), goalAmountPaise: 15000000, status: 'ACTIVE' });
  const library = mkFund(sky, { name: 'Library Book Drive', description: 'Donated 1,200 books to the department libraries.', startsOn: dateOnly(daysFromNow(-120)), targetDate: dateOnly(daysFromNow(-60)), goalAmountPaise: 2000000, status: 'COMPLETED' });
  mkFund(sky, { name: 'Alumni Meet Fund', description: 'Planning stage. Tasks will be assigned after the GBM.', startsOn: dateOnly(daysFromNow(10)), targetDate: dateOnly(daysFromNow(90)), goalAmountPaise: 8000000, status: 'PLANNING' });
  const mkTask = (f, t) => db.tasks.push({ id: uid('tsk'), fundraiserId: f.id, clubId: f.clubId, description: '', status: 'TODO', progressPercent: 0, createdAt: daysFromNow(-18), completedAt: null, ...t });
  mkTask(winter, { title: 'Design collection posters', assigneeUserId: meera.id, deadline: daysFromNow(-12), status: 'DONE', progressPercent: 100, completedAt: daysFromNow(-13) });
  mkTask(winter, { title: 'Set up drop boxes in hostels', assigneeUserId: others[0].id, deadline: daysFromNow(-5), status: 'DONE', progressPercent: 100, completedAt: daysFromNow(-6) });
  mkTask(winter, { title: 'Coordinate with NGO for distribution', assigneeUserId: ravi.id, deadline: daysFromNow(10), status: 'IN_PROGRESS', progressPercent: 60 });
  mkTask(winter, { title: 'Sort and pack donations', assigneeUserId: meera.id, deadline: daysFromNow(18), status: 'IN_PROGRESS', progressPercent: 35 });
  mkTask(winter, { title: 'Arrange transport (2 vans)', assigneeUserId: others[1].id, deadline: daysFromNow(20), status: 'TODO' });
  mkTask(sponsor, { title: 'Prepare sponsorship deck', assigneeUserId: karthik.id, deadline: daysFromNow(-20), status: 'DONE', progressPercent: 100, completedAt: daysFromNow(-22) });
  mkTask(sponsor, { title: 'Pitch to 10 local companies', assigneeUserId: meera.id, deadline: daysFromNow(-2), status: 'IN_PROGRESS', progressPercent: 40 });
  mkTask(sponsor, { title: 'Follow up with alumni network', assigneeUserId: others[2].id, deadline: daysFromNow(5), status: 'TODO' });
  mkTask(sponsor, { title: 'Draft sponsor agreements', assigneeUserId: ravi.id, deadline: daysFromNow(6), status: 'TODO' });
  mkTask(library, { title: 'Collect books', assigneeUserId: meera.id, deadline: daysFromNow(-70), status: 'DONE', progressPercent: 100 });
  mkTask(library, { title: 'Catalogue donations', assigneeUserId: others[0].id, deadline: daysFromNow(-62), status: 'DONE', progressPercent: 100 });

  const income = (f, amountPaise, daysAgo, description) => postLedger(db, { clubId: f.clubId, direction: 'IN', category: 'FUNDRAISER_INCOME', amountPaise, sourceType: 'INCOME_ENTRY', sourceId: uid('inc'), fundraiserId: f.id, recordedBy: ravi.id, reference: `RCPT-${1000 + db.ledger.length}`, description, occurredAt: daysFromNow(-daysAgo, 16) });
  income(winter, 1200000, 15, 'Cash collection, hostel drive');
  income(winter, 850000, 6, 'Faculty contributions');
  income(sponsor, 5000000, 10, 'Associate sponsor: CodeCraft Labs');
  income(library, 1800000, 70, 'Book fair proceeds');

  /* ── Expenses & budget ── */
  const semStart = new Date();
  semStart.setMonth(semStart.getMonth() < 6 ? 0 : 6, 1);
  db.budgets.push({ id: uid('bud'), clubId: sky.id, name: 'Odd semester 2026', periodStart: dateOnly(semStart.toISOString()), periodEnd: dateOnly(new Date(semStart.getFullYear(), semStart.getMonth() + 6, 0).toISOString()), amountPaise: 40000000, notes: 'Approved in the July GBM.', createdBy: ravi.id });
  db.budgets.push({ id: uid('bud'), clubId: sky.id, name: 'Even semester 2026', periodStart: dateOnly(new Date(semStart.getFullYear(), semStart.getMonth() - 6, 1).toISOString()), periodEnd: dateOnly(new Date(semStart.getFullYear(), semStart.getMonth(), 0).toISOString()), amountPaise: 30000000, notes: null, createdBy: ravi.id });

  const mkExpense = (e) => {
    const file = { id: uid('file'), clubId: sky.id, uploadedBy: e.submittedBy, purpose: 'RECEIPT', originalName: e.receiptName || 'receipt.pdf', mimeType: 'application/pdf', sizeBytes: 182000 };
    db.files.push(file);
    const ex = { id: uid('exp'), clubId: sky.id, kind: 'REIMBURSEMENT', eventId: null, fundraiserId: null, receiptFileId: file.id, payeeUserId: e.submittedBy, decidedBy: null, decidedAt: null, decisionNote: null, paidBy: null, paidAt: null, payoutReference: null, createdAt: daysFromNow(-e.daysAgo, 10), incurredOn: dateOnly(daysFromNow(-e.daysAgo - 1)), ...e };
    delete ex.daysAgo;
    db.expenses.push(ex);
    if (ex.status === 'PAID') {
      ex.paidBy = ravi.id;
      ex.paidAt = ex.paidAt || daysFromNow(-(e.daysAgo - 2 > 0 ? e.daysAgo - 2 : 0), 15);
      ex.decidedBy = ex.kind === 'DIRECT' ? null : ravi.id;
      ex.decidedAt = ex.kind === 'DIRECT' ? null : ex.paidAt;
      ex.payoutReference = ex.payoutReference || `UPI-${Math.floor(100000 + Math.random() * 899999)}`;
      postLedger(db, { clubId: sky.id, direction: 'OUT', category: ex.kind === 'DIRECT' ? 'DIRECT_EXPENSE' : 'REIMBURSEMENT_PAYOUT', amountPaise: ex.amountPaise, sourceType: 'EXPENSE', sourceId: ex.id, eventId: ex.eventId, fundraiserId: ex.fundraiserId, recordedBy: ravi.id, approvedBy: ex.decidedBy, reference: ex.payoutReference, description: ex.title, evidenceFileId: file.id, occurredAt: ex.paidAt });
    } else if (ex.status === 'APPROVED' || ex.status === 'REJECTED') {
      ex.decidedBy = ex.submittedBy === ravi.id ? asha.id : ravi.id;
      ex.decidedAt = daysFromNow(-Math.max(0, e.daysAgo - 1), 12);
      if (ex.status === 'REJECTED') ex.decisionNote = ex.decisionNote || 'Receipt is not itemised. Please resubmit with the GST invoice.';
    }
    return ex;
  };
  mkExpense({ title: 'Sound system rental', description: 'DJ console + speakers for Freshers night', amountPaise: 1800000, kind: 'DIRECT', status: 'PAID', submittedBy: ravi.id, eventId: freshers.id, daysAgo: 31, receiptName: 'sound-invoice.pdf' });
  mkExpense({ title: 'Decorations & lighting', description: 'Fairy lights, banners', amountPaise: 640000, status: 'PAID', submittedBy: meera.id, eventId: freshers.id, daysAgo: 33, receiptName: 'decor-bill.jpg' });
  mkExpense({ title: 'Snacks for volunteers', description: 'Freshers setup team', amountPaise: 185000, status: 'PAID', submittedBy: others[0].id, eventId: freshers.id, daysAgo: 30 });
  mkExpense({ title: 'Poster printing', description: 'A2 posters × 40 for clothing drive', amountPaise: 240000, status: 'PAID', submittedBy: meera.id, fundraiserId: winter.id, daysAgo: 14 });
  mkExpense({ title: 'Tech Fest venue deposit', description: 'Refundable deposit to the auditorium committee', amountPaise: 2500000, kind: 'DIRECT', status: 'PAID', submittedBy: ravi.id, eventId: techFest.id, daysAgo: 12 });
  mkExpense({ title: 'Hoodie batch, print vendor', description: 'Balance payment for 69 hoodies', amountPaise: 3450000, kind: 'DIRECT', status: 'PAID', submittedBy: ravi.id, daysAgo: 45 });
  mkExpense({ title: 'Packing boxes', description: 'Cartons and tape for donations', amountPaise: 92000, status: 'APPROVED', submittedBy: meera.id, fundraiserId: winter.id, daysAgo: 4 });
  mkExpense({ title: 'Speaker travel for Tech Fest', description: 'Cab fare for keynote speaker', amountPaise: 350000, status: 'APPROVED', submittedBy: karthik.id, eventId: techFest.id, daysAgo: 3 });
  mkExpense({ title: 'Lanyards & badges', description: '300 lanyards for Tech Fest', amountPaise: 420000, status: 'SUBMITTED', submittedBy: karthik.id, eventId: techFest.id, daysAgo: 2 });
  mkExpense({ title: 'Courier for sponsor kits', description: 'Shipping sponsor welcome kits', amountPaise: 78000, status: 'SUBMITTED', submittedBy: others[2].id, fundraiserId: sponsor.id, daysAgo: 1 });
  mkExpense({ title: 'Stationery for GBM', description: 'Registers, pens, markers', amountPaise: 64000, status: 'SUBMITTED', submittedBy: ravi.id, daysAgo: 1 });
  mkExpense({ title: 'Team dinner', description: 'Post-event dinner', amountPaise: 560000, status: 'REJECTED', submittedBy: others[1].id, daysAgo: 25 });

  db.meta = { seededAt: new Date().toISOString(), demoAccounts: { asha: asha.email, ravi: ravi.email, meera: meera.email, karthik: karthik.email, priya: priya.email, vikram: vikram.email } };
  return db;
}
