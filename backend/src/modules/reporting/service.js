import { LEDGER_CATEGORY_LIST } from './categories.js';
import * as repository from './repository.js';

// Reports (LLD §4.10). Step 4 delivers the finance report only (OQ-52 APPROVED): the §2.10 summary,
// the monthly series with net, and a per-category breakdown (amount and number of entries).
// The summary comes from the finance module's public API so the formulas live in one place.

export function createReportingService({ db, financeSummary, timeZone }) {
  async function financeReport(clubId, { from, to }) {
    const [summary, breakdown] = await Promise.all([
      financeSummary(clubId, { from, to }),
      repository.ledgerCategoryBreakdown(db, clubId, { from, to, timeZone }),
    ]);
    const byKey = new Map(breakdown.map((r) => [`${r.direction}:${r.category}`, r]));
    const categoryBreakdown = {};
    for (const [direction, categories] of Object.entries(LEDGER_CATEGORY_LIST)) {
      categoryBreakdown[direction] = categories.map((category) => {
        const r = byKey.get(`${direction}:${category}`);
        return { category, totalPaise: r?.total ?? 0, entries: r?.entries ?? 0 };
      });
    }
    const { monthly, ...metrics } = summary;
    return {
      ...metrics,
      monthly: monthly.map((m) => ({ ...m, netPaise: m.inPaise - m.outPaise })),
      categoryBreakdown,
    };
  }

  return Object.freeze({ financeReport });
}
