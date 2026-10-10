/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-repo-cross-module',
      comment: 'Services must not import another module repository or domain',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/(repository|domain)',
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'payments-no-consumer-modules',
      comment: 'finance/payments must not import membership/event/merchandise modules',
      severity: 'error',
      from: { path: '^src/modules/finance/payments' },
      to: { path: '^src/modules/(memberships|events|merchandise)' },
    },
    {
      name: 'controller-only-service',
      severity: 'warn',
      from: { path: 'controller\\.js$' },
      to: { path: 'repository\\.js$', pathNot: 'shared' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: false,
    enhancedResolveOptions: { exportsFields: ['exports'] },
  },
};
