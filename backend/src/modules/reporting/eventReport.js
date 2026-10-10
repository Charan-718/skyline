export function createEventReportService({ db }) {
  return {
    async getEventReport(eventId) {
      const event = await db('events').where({ id: eventId }).first();
      if (!event) return null;

      const ticketsSold = await db('tickets')
        .where({ event_id: eventId })
        .whereIn('status', ['VALID', 'USED'])
        .count('* as c')
        .first();

      const pendingBookings = await db('bookings')
        .where({ event_id: eventId, status: 'PENDING_PAYMENT' })
        .count('* as c')
        .first();

      const gross = await db('financial_transactions')
        .where({ event_id: eventId, category: 'TICKET_SALE' })
        .sum('amount_paise as s')
        .first();

      const expensesPaid = await db('financial_transactions')
        .where({ event_id: eventId, direction: 'OUT' })
        .sum('amount_paise as s')
        .first();

      const expensesApprovedUnpaid = await db('expenses')
        .where({ event_id: eventId, status: 'APPROVED' })
        .sum('amount_paise as s')
        .first();

      const checkedIn = await db('check_ins').where({ event_id: eventId }).count('* as c').first();

      const buyerRows = await db('bookings as b')
        .join('tickets as t', 't.booking_id', 'b.id')
        .where('b.event_id', eventId)
        .whereIn('t.status', ['VALID', 'USED'])
        .groupBy('b.buyer_type')
        .select('b.buyer_type')
        .count('* as c');

      const memberVsNonMember = { MEMBER: 0, NON_MEMBER: 0 };
      for (const row of buyerRows) {
        if (row.buyer_type === 'MEMBER') memberVsNonMember.MEMBER = Number(row.c);
        if (row.buyer_type === 'NON_MEMBER') memberVsNonMember.NON_MEMBER = Number(row.c);
      }

      const earlyBirdSold = await db('bookings as b')
        .join('tickets as t', 't.booking_id', 'b.id')
        .where('b.event_id', eventId)
        .whereIn('t.status', ['VALID', 'USED'])
        .where('b.uses_early_bird', true)
        .count('* as c')
        .first();

      const paymentRows = await db('payments as p')
        .join('bookings as b', 'b.id', 'p.booking_id')
        .where('b.event_id', eventId)
        .groupBy('p.status')
        .select('p.status')
        .count('* as c')
        .sum('p.amount_paise as amount');

      const ledgerInRows = await db('financial_transactions')
        .where({ event_id: eventId, category: 'TICKET_SALE' })
        .select('occurred_at', 'amount_paise');

      const checkInRows = await db('check_ins')
        .where({ event_id: eventId })
        .select('checked_in_at');

      const sold = Number(ticketsSold.c);
      const checked = Number(checkedIn.c);
      const grossPaise = Number(gross.s ?? 0);
      const expensesPaidPaise = Number(expensesPaid.s ?? 0);

      const revenueByDay = {};
      for (const row of ledgerInRows) {
        const date = new Date(row.occurred_at).toISOString().slice(0, 10);
        revenueByDay[date] = (revenueByDay[date] || 0) + Number(row.amount_paise);
      }
      const revenueSeries = Object.entries(revenueByDay)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, amountPaise]) => ({ date, amountPaise }));

      const checkInBuckets = {};
      for (const row of checkInRows) {
        const t = new Date(row.checked_in_at);
        t.setMinutes(Math.floor(t.getMinutes() / 15) * 15, 0, 0);
        const at = t.toISOString();
        checkInBuckets[at] = (checkInBuckets[at] || 0) + 1;
      }
      const checkInSeries = Object.entries(checkInBuckets)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([at, count]) => ({ at, count }));

      const paymentStatusBreakdown = paymentRows.map((row) => ({
        status: row.status,
        count: Number(row.c),
        amountPaise: Number(row.amount ?? 0),
      }));

      return {
        eventId,
        capacity: event.capacity,
        seatsReserved: event.seats_reserved,
        ticketsSold: sold,
        pendingBookings: Number(pendingBookings.c),
        remainingCapacity: event.capacity - event.seats_reserved,
        memberVsNonMember,
        earlyBirdSold: Number(earlyBirdSold.c),
        grossRecordedRevenuePaise: grossPaise,
        refundsPaise: 0,
        netRecordedRevenuePaise: grossPaise,
        paymentStatusBreakdown,
        checkedIn: checked,
        attendanceRate: sold > 0 ? checked / sold : null,
        expensesPaidPaise,
        expensesApprovedUnpaidPaise: Number(expensesApprovedUnpaid.s ?? 0),
        eventNetPaise: grossPaise - expensesPaidPaise,
        revenueSeries,
        checkInSeries,
      };
    },
  };
}
