'use strict';

const { ApiError } = require('./rules');
const roles = Object.freeze({
  superadmin: ['operations', 'qualification', 'privacy', 'evidence'],
  operator: ['operations'],
  verifier: ['qualification']
});
const optionalPermissions = ['privacy', 'evidence'];
function permissionsFor(role, grants = []) {
  if (!Object.hasOwn(roles, role)) return [];
  if (!Array.isArray(grants) || grants.some((x) => !optionalPermissions.includes(x)))
    throw Error('INVALID_ADMIN_PERMISSIONS');
  return [...new Set([...roles[role], ...grants])];
}
function hasRole(role, expected) {
  return role === expected || role === 'superadmin';
}
function requirePermission(session, permission) {
  if (!session.permissions.includes(permission))
    throw new ApiError(403, 'ADMIN_FORBIDDEN', '当前管理账号未获此项权限');
}
const credentialKinds = ['qualification', 'merchant', 'advertiser', 'industrycredential'];
function taskPermission(kind) {
  if (credentialKinds.includes(kind)) return 'qualification';
  if (kind === 'privacy') return 'privacy';
  return 'operations';
}
// Every admin route must have an explicit method and path entry. New routes fail closed.
const routes = [
  ['GET', /^\/admin\/api\/trust\/users\/[0-9a-f-]{36}\/qualification$/i, 'qualification'],
  ['GET', /^\/admin\/api\/memorial\/queue$/, 'qualification-or-operations'],
  ['GET', /^\/admin\/api\/memorial\/(?:authorizations|proofs)\/[0-9a-f-]{36}$/i, 'qualification'],
  ['POST', /^\/admin\/api\/memorial\/authorizations\/[0-9a-f-]{36}$/i, 'qualification'],
  ['GET', /^\/admin\/api\/memorial\/halls\/[0-9a-f-]{36}$/i, 'operations'],
  ['POST', /^\/admin\/api\/memorial\/(?:halls|reports)\/[0-9a-f-]{36}$/i, 'operations'],
  ['GET', /^\/admin\/api\/publication-records\/[0-9a-f-]{36}$/i, 'operations'],
  [
    'GET',
    /^\/admin\/api\/(session|catalog|trust\/classification|stats|trust|queue|workbench)$/,
    'session'
  ],
  ['POST', /^\/admin\/api\/logout$/, 'session'],
  ['GET', /^\/admin\/api\/workbench\/[a-z]+\/[0-9a-f-]{36}$/i, 'task'],
  ['GET', /^\/admin\/api\/privacy-requests(?:\/[0-9a-f-]{36})?$/i, 'privacy'],
  ['POST', /^\/admin\/api\/privacy-requests\/[0-9a-f-]{36}(?:\/execute-closure)?$/i, 'privacy'],
  ['GET', /^\/admin\/api\/(?:reports|trust\/risks)\/[0-9a-f-]{36}\/evidence$/i, 'evidence'],
  ['GET', /^\/admin\/api\/licenses\/[0-9a-f-]{36}$/i, 'qualification'],
  ['POST', /^\/admin\/api\/approve-merchant$/, 'qualification'],
  [
    'POST',
    /^\/admin\/api\/trust\/users\/[0-9a-f-]{36}\/(?:identity|phone|qualification)$/i,
    'qualification'
  ],
  ['GET', /^\/admin\/api\/industry\/credentials$/, 'qualification'],
  ['POST', /^\/admin\/api\/industry\/credentials\/[0-9a-f-]{36}$/i, 'qualification'],
  ['GET', /^\/admin\/api\/home-advertisers$/, 'qualification-or-operations'],
  ['POST', /^\/admin\/api\/home-advertisers\/[0-9a-f-]{36}$/i, 'qualification'],
  ['GET', /^\/admin\/api\/media\/[0-9a-f-]{36}$/i, 'qualification-or-operations'],
  [
    'GET',
    /^\/admin\/api\/(?:comments|operations\/health|points\/rules|points\/users\/[0-9a-f-]{36})$/i,
    'operations'
  ],
  [
    'POST',
    /^\/admin\/api\/(?:regions|regions\/status|categories\/status|review|review-service|review-report|comments\/review|emergency-remove|operations\/run)$/,
    'operations'
  ],
  ['PUT', /^\/admin\/api\/map-locations\/[0-9a-f-]{36}$/i, 'operations'],
  [
    'POST',
    /^\/admin\/api\/trust\/(?:users\/[0-9a-f-]{36}\/risk|risks\/[0-9a-f-]{36}|appeals\/[0-9a-f-]{36})$/i,
    'operations'
  ],
  [
    'POST',
    /^\/admin\/api\/points\/(?:rules\/[a-z0-9_]+|rewards\/[0-9a-f-]{36}\/(?:review|reverse)|appeals\/[0-9a-f-]{36}\/review|users\/[0-9a-f-]{36}\/adjust)$/i,
    'operations'
  ],
  ['GET', /^\/admin\/api\/home-(?:cities|targets|content|reports)$/, 'operations'],
  [
    'POST',
    /^\/admin\/api\/home-(?:content|advertisers|reports\/[0-9a-f-]{36}|content\/[0-9a-f-]{36}\/review)$/i,
    'operations'
  ],
  ['PUT', /^\/admin\/api\/home-content\/[0-9a-f-]{36}$/i, 'operations'],
  ['GET', /^\/admin\/api\/commerce\/(?:offers|orders|slots|campaigns)$/, 'operations'],
  [
    'POST',
    /^\/admin\/api\/commerce\/(?:offers|slots|orders\/[0-9a-f-]{36}|slots\/[0-9a-f-]{36}|campaigns\/[0-9a-f-]{36}\/(?:review|status))$/i,
    'operations'
  ],
  ['PUT', /^\/admin\/api\/commerce\/offers\/[0-9a-f-]{36}$/i, 'operations'],
  ['GET', /^\/admin\/api\/industry\/(?:entries|reports|entries\/[0-9a-f-]{36})$/i, 'operations'],
  ['POST', /^\/admin\/api\/industry\/(?:entries|reports)\/[0-9a-f-]{36}$/i, 'operations'],
  ['POST', /^\/admin\/api\/industry-services\/[0-9a-f-]{36}\/review$/i, 'operations'],
  ['GET', /^\/admin\/api\/business\/(?:disputes|cases\/[0-9a-f-]{36})$/i, 'operations'],
  ['POST', /^\/admin\/api\/business\/cases\/[0-9a-f-]{36}$/i, 'operations']
];
function authorizeRoute(session, method, pathname) {
  const rule = routes.find(([verb, pattern]) => verb === method && pattern.test(pathname));
  if (!rule) throw new ApiError(403, 'ADMIN_ROUTE_DENIED', '后台接口尚未授权');
  let permission = rule[2];
  if (permission === 'task') permission = taskPermission(pathname.split('/')[4]);
  if (permission === 'qualification-or-operations') {
    if (!session.permissions.some((x) => ['qualification', 'operations'].includes(x)))
      requirePermission(session, 'operations');
  } else if (permission !== 'session') requirePermission(session, permission);
  return permission;
}
module.exports = {
  roles,
  optionalPermissions,
  permissionsFor,
  hasRole,
  requirePermission,
  authorizeRoute,
  taskPermission
};
