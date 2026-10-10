import { AppError, assertFound } from '../../shared/errors.js';
import { createAuditService } from '../../shared/audit.js';
import { isClubHeadRegistrationEmail } from '../auth/verification/roster.js';
import { config } from '../../config/index.js';

export function createClubService({ clubRepository, authRepository, auditRepository, authz, collegeRosterRepository }) {
  const audit = createAuditService(auditRepository);

  async function requireVerifiedStudent(userId) {
    const verification = await authRepository.getCurrentVerification(userId);
    if (verification?.outcome !== 'VERIFIED') {
      throw new AppError(
        'NOT_VERIFIED',
        403,
        'Only verified college students can be assigned as club head',
      );
    }
  }

  async function requireClubHeadEligibleUser(user) {
    const eligible =
      collegeRosterRepository && config.COLLEGE_VERIFICATION_MODE === 'database'
        ? await collegeRosterRepository.isClubHeadEligibleEmail(user.email)
        : isClubHeadRegistrationEmail(user.email);
    if (!eligible) {
      throw new AppError(
        'CLUB_HEAD_NOT_ELIGIBLE',
        403,
        'This user is not listed as club-head eligible in the college database',
      );
    }
  }

  return {
    getCapabilities: (userId) => authz.getCapabilities(userId),

    async listClubs(query) {
      const page = Number(query.page ?? 1);
      const pageSize = Math.min(Number(query.pageSize ?? 20), 100);
      const items = await clubRepository.listPublic({
        q: query.q,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      return { items, page, pageSize };
    },

    async getClub(clubRef) {
      const club = await clubRepository.findByRef(clubRef);
      assertFound(club, 'Club not found');
      return club;
    },

    async createClubViaCli(dto) {
      const slug = dto.slug.toLowerCase();
      const existing = await clubRepository.findBySlug(slug);
      if (existing) throw new AppError('CONFLICT_STATE', 409, 'Slug taken');
      return clubRepository.createClub(
        {
          slug,
          name: dto.name,
          description: dto.description ?? '',
          contact_email: dto.contactEmail ?? null,
          member_number_prefix: dto.memberNumberPrefix,
          is_active: true,
        },
        clubRepository.db,
      );
    },

    async assignClubHeadViaCli(clubId, userEmail) {
      const club = await clubRepository.findById(clubId);
      assertFound(club, 'Club not found');
      const user = await authRepository.findUserByEmail(userEmail);
      if (!user) throw new AppError('USER_NOT_FOUND', 422, 'User not found');
      await requireVerifiedStudent(user.id);
      await requireClubHeadEligibleUser(user);
      try {
        return await clubRepository.assignRole(
          {
            club_id: clubId,
            user_id: user.id,
            role: 'CLUB_HEAD',
            assigned_by: null,
          },
          clubRepository.db,
        );
      } catch (err) {
        if (err.code === '23505') {
          throw new AppError('ROLE_ALREADY_ASSIGNED', 409, 'Role already assigned');
        }
        throw err;
      }
    },

    async listRoles(actorUserId, clubId) {
      await authz.requireClubHead(actorUserId, clubId);
      return clubRepository.listRoles(clubId);
    },

    async assignRole(actorUserId, clubId, dto, requestId) {
      await authz.requireClubHead(actorUserId, clubId);
      const user = await authRepository.findUserByEmail(dto.userEmail);
      if (!user) throw new AppError('USER_NOT_FOUND', 422, 'User not found');
      if (dto.role === 'CLUB_HEAD') {
        await requireVerifiedStudent(user.id);
        await requireClubHeadEligibleUser(user);
      }
      try {
        const assignment = await clubRepository.assignRole(
          {
            club_id: clubId,
            user_id: user.id,
            role: dto.role,
            assigned_by: actorUserId,
          },
          clubRepository.db,
        );
        await audit.record(clubRepository.db, {
          actorUserId,
          clubId,
          action: 'CLUB_ROLE_ASSIGNED',
          entityType: 'club_role_assignment',
          entityId: assignment.id,
          requestId,
        });
        return assignment;
      } catch (err) {
        if (err.code === '23505') {
          throw new AppError('ROLE_ALREADY_ASSIGNED', 409, 'Role already assigned');
        }
        throw err;
      }
    },

    async revokeRole(actorUserId, clubId, assignmentId, requestId) {
      await authz.requireClubHead(actorUserId, clubId);
      const assignment = await clubRepository.findAssignment(assignmentId);
      assertFound(assignment, 'Assignment not found');
      if (assignment.clubId !== clubId) {
        throw new AppError('NOT_FOUND', 404, 'Assignment not found');
      }
      if (assignment.role === 'CLUB_HEAD') {
        const heads = await clubRepository.countActiveClubHeads(clubId, clubRepository.db);
        if (heads <= 1) {
          throw new AppError('LAST_CLUB_HEAD', 422, 'Cannot revoke the last club head');
        }
      }
      const revoked = await clubRepository.revokeRole(assignmentId, actorUserId, clubRepository.db);
      await audit.record(clubRepository.db, {
        actorUserId,
        clubId,
        action: 'CLUB_ROLE_REVOKED',
        entityType: 'club_role_assignment',
        entityId: assignmentId,
        requestId,
      });
      return revoked;
    },
  };
}
