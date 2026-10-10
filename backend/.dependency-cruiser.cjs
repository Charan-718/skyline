/** Module boundaries (LLD §1.2). Run: npm run lint:deps */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-foreign-repository-or-domain',
      comment: "A module may use another module only through its index.js — never its repository or domain.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: ['^src/modules/[^/]+/.*repository\\.js$', '^src/modules/[^/]+/domain/', '^src/modules/[^/]+/.+/domain/'],
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'no-foreign-module-internals',
      comment: 'Cross-module imports go through the other module index.js.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/[^/]+/', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.js$'] },
    },
    {
      name: 'payments-not-coupled-to-purposes',
      comment: 'finance/payments must not import memberships, events or merchandise; handlers are registered in container.js.',
      severity: 'error',
      from: { path: '^src/modules/finance/payments/' },
      to: { path: '^src/modules/(memberships|events|merchandise)/' },
    },
    {
      name: 'controller-only-calls-service',
      comment: 'Controllers have no SQL: no repository, knex or db imports.',
      severity: 'error',
      from: { path: 'controller\\.js$' },
      to: { path: ['repository\\.js$', '^src/db/', 'node_modules/(knex|pg)/'] },
    },
    {
      name: 'service-not-http',
      comment: 'Services never touch req/res.',
      severity: 'error',
      from: { path: '(service|repository)\\.js$' },
      to: { path: ['node_modules/express/', 'controller\\.js$', 'routes\\.js$'] },
    },
    {
      name: 'domain-is-pure',
      comment: 'Domain files: no I/O, no framework, no repositories.',
      severity: 'error',
      from: { path: '/domain/' },
      to: { path: ['repository\\.js$', 'service\\.js$', '^src/db/', 'node_modules/', '^node:'], pathNot: '^src/shared/money\\.js$' },
    },
    {
      name: 'shared-does-not-import-modules',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/modules/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    moduleSystems: ['es6'],
  },
};
