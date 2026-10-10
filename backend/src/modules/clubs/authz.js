import { AppError } from '../../shared/errors.js';
import { todayIST } from '../../shared/clock.js';

function effectiveMembershipStatus(m) {
  if (m.status === 'ACTIVE' && m.expires_on && m.expires_on < todayIST()) {
    return 'EXPIRED';
  }
  return m.status;
}

export function createClubAuthz({ db }) {
  async function loadRoles(userId) {
    const rows = await db('club_role_assignments')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .select('club_id', 'role');
    return rows;
  }

  async function loadOrganizerEvents(userId) {
    const rows = await db('event_organizers').where({ user_id: userId }).select('event_id');
    return rows.map((r) => r.event_id);
  }

  async function loadStaffEvents(userId) {
    const rows = await db('event_staff').where({ user_id: userId }).select('event_id');
    return rows.map((r) => r.event_id);
  }

  async function loadMemberships(userId) {
    const rows = await db('memberships').where({ user_id: userId }).select('*');
    return rows.map((m) => ({
      clubId: m.club_id,
      membershipId: m.id,
      effectiveStatus: effectiveMembershipStatus(m),
      expiresOn: m.expires_on,
    }));
  }

  return {
    async getCapabilities(userId) {
      const [roles, memberships, organizerOf, staffOf] = await Promise.all([
        loadRoles(userId),
        loadMemberships(userId),
        loadOrganizerEvents(userId),
        loadStaffEvents(userId),
      ]);
      const verification = await db('college_verifications')
        .where({ user_id: userId })
        .whereNull('superseded_at')
        .where({ outcome: 'VERIFIED' })
        .first();
      return {
        verifiedStudent: !!verification,
        memberships,
        clubRoles: roles.map((r) => ({ clubId: r.club_id, role: r.role })),
        organizerOf,
        staffOf,
      };
    },

    async isClubHead(userId, clubId) {
      const row = await db('club_role_assignments')
        .where({ user_id: userId, club_id: clubId, role: 'CLUB_HEAD' })
        .whereNull('revoked_at')
        .first();
      return !!row;
    },

    async isTreasurer(userId, clubId) {
      const row = await db('club_role_assignments')
        .where({ user_id: userId, club_id: clubId, role: 'TREASURER' })
        .whereNull('revoked_at')
        .first();
      return !!row;
    },

    async isVolunteer(userId, clubId) {
      const row = await db('club_role_assignments')
        .where({ user_id: userId, club_id: clubId, role: 'VOLUNTEER' })
        .whereNull('revoked_at')
        .first();
      return !!row;
    },

    async isOrganizer(userId, eventId) {
      const row = await db('event_organizers').where({ event_id: eventId, user_id: userId }).first();
      return !!row;
    },

    async isStaff(userId, eventId) {
      const row = await db('event_staff').where({ event_id: eventId, user_id: userId }).first();
      return !!row;
    },

    async eventClubId(eventId) {
      const ev = await db('events').where({ id: eventId }).select('club_id').first();
      return ev?.club_id ?? null;
    },

    async checkRole(userId, role, { clubId, eventId, caps }) {
      const capabilities = caps ?? (await this.getCapabilities(userId));
      if (role === 'AUTH') return true;

      if (role === 'CH' && clubId) {
        return capabilities.clubRoles.some((r) => r.clubId === clubId && r.role === 'CLUB_HEAD');
      }
      if (role === 'TR' && clubId) {
        return capabilities.clubRoles.some((r) => r.clubId === clubId && r.role === 'TREASURER');
      }
      if (role === 'VOL' && clubId) {
        return capabilities.clubRoles.some((r) => r.clubId === clubId && r.role === 'VOLUNTEER');
      }
      if (role === 'TEAM' && clubId) {
        const inClub = capabilities.clubRoles.some((r) => r.clubId === clubId);
        const orgOfClubEvent = capabilities.organizerOf.length > 0;
        if (inClub) return true;
        if (orgOfClubEvent) {
          const cid = clubId;
          for (const eid of capabilities.organizerOf) {
            const ec = await this.eventClubId(eid);
            if (ec === cid) return true;
          }
        }
        return false;
      }
      if (role === 'ORG' && eventId) {
        return capabilities.organizerOf.includes(eventId);
      }
      if (role === 'STAFF' && eventId) {
        return (
          capabilities.staffOf.includes(eventId) ||
          capabilities.organizerOf.includes(eventId) ||
          (clubId &&
            capabilities.clubRoles.some(
              (r) => r.clubId === clubId && (r.role === 'CLUB_HEAD' || r.role === 'VOLUNTEER'),
            ))
        );
      }
      return false;
    },

    async requireClubHead(userId, clubId) {
      if (!(await this.isClubHead(userId, clubId))) {
        throw new AppError('FORBIDDEN', 403, 'Club head role required');
      }
    },
  };
}
