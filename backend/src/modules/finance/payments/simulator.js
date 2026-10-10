// Simulated AutoPay outcome (LLD §5.4 step 4): SIM_AUTOPAY_OUTCOME, or a dev override.
// No real payment provider exists or is called.

const OUTCOMES = ['SUCCEEDED', 'FAILED', 'PENDING'];

export function createSimulator({ autopayOutcome }) {
  return Object.freeze({
    decide({ override } = {}) {
      const outcome = override ?? autopayOutcome;
      if (!OUTCOMES.includes(outcome)) throw new TypeError(`unknown simulated outcome ${outcome}`);
      return outcome;
    },
  });
}
