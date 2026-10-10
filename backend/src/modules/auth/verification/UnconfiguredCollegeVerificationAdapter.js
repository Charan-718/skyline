export function createUnconfiguredCollegeVerificationAdapter() {
  return {
    async verify() {
      return { outcome: 'UNAVAILABLE' };
    },
  };
}
