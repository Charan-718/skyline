// Route-level club role check. `roles` uses the names in shared/access.js (CLUB_HEAD,
// TREASURER, VOLUNTEER, ORGANIZER); pass TEAM for "any team member". Same-club standing without
// the role -> 403; no standing in the club -> 404 (LLD §4.0).

export function createAuthorize({ access }) {
  return function requireClubRole(roles, { clubIdFrom = (req) => req.valid?.params?.clubId ?? req.params.clubId } = {}) {
    return async (req, res, next) => {
      try {
        req.standing = await access.requireRole(req.actor, clubIdFrom(req), roles);
        next();
      } catch (err) {
        next(err);
      }
    };
  };
}
