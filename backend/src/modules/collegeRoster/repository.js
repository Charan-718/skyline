import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toCamelCase } from '../../shared/caseMap.js';
import { isCollegeEmailDomain } from '../../shared/collegeEmail.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function normalizeEmail(email) {
  return email?.trim().toLowerCase() ?? '';
}

function nameMatches(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

function mapRow(row) {
  return row ? toCamelCase(row) : null;
}

export function createCollegeRosterRepository({ db }) {
  return {
    db,

    async upsertRow(row, trx = db) {
      const payload = {
        student_identifier: row.studentIdentifier,
        full_name: row.fullName,
        college_email: row.collegeEmail ? row.collegeEmail.toLowerCase() : null,
        program: row.program ?? null,
        club_head_eligible: row.clubHeadEligible === true,
        linked_user_id: row.linkedUserId ?? null,
        is_active: row.isActive !== false,
        updated_at: trx.fn.now(),
      };
      const [inserted] = await trx('college_student_roster')
        .insert({ ...payload, created_at: trx.fn.now() })
        .onConflict('student_identifier')
        .merge({
          full_name: payload.full_name,
          college_email: payload.college_email,
          program: payload.program,
          club_head_eligible: payload.club_head_eligible,
          linked_user_id: trx.raw('COALESCE(college_student_roster.linked_user_id, excluded.linked_user_id)'),
          is_active: payload.is_active,
          updated_at: trx.fn.now(),
        })
        .returning('*');
      return mapRow(inserted);
    },

    async findActiveByStudentIdentifier(studentIdentifier, trx = db) {
      const row = await trx('college_student_roster')
        .where({ student_identifier: studentIdentifier, is_active: true })
        .first();
      return mapRow(row);
    },

    async findActiveByCollegeEmail(email, trx = db) {
      const row = await trx('college_student_roster')
        .whereRaw('lower(college_email) = ?', [normalizeEmail(email)])
        .where({ is_active: true })
        .first();
      return mapRow(row);
    },

    /**
     * Match logic for verification adapter.
     * @param {{ studentIdentifier?: string, fullName: string, accountEmail?: string, collegeDomains: string[] }} input
     */
    async findVerificationMatch({ studentIdentifier, fullName, accountEmail, collegeDomains }, trx = db) {
      if (studentIdentifier === 'MOCK-UNAVAILABLE') {
        return { outcome: 'UNAVAILABLE' };
      }

      if (studentIdentifier) {
        const row = await this.findActiveByStudentIdentifier(studentIdentifier, trx);
        if (!row || !nameMatches(row.fullName, fullName)) {
          return { outcome: 'NOT_VERIFIED' };
        }
        const accountIsCollege =
          accountEmail && isCollegeEmailDomain(accountEmail, collegeDomains);
        if (accountIsCollege && row.collegeEmail && accountEmail) {
          if (normalizeEmail(accountEmail) !== normalizeEmail(row.collegeEmail)) {
            return { outcome: 'NOT_VERIFIED' };
          }
        }
        return {
          outcome: 'VERIFIED',
          row,
          externalReference: `roster:${studentIdentifier}`,
          studentIdentifier: row.studentIdentifier,
        };
      }

      if (accountEmail) {
        const row = await this.findActiveByCollegeEmail(accountEmail, trx);
        if (!row || !nameMatches(row.fullName, fullName)) {
          return { outcome: 'NOT_VERIFIED' };
        }
        return {
          outcome: 'VERIFIED',
          row,
          externalReference: `roster:${row.studentIdentifier}`,
          studentIdentifier: row.studentIdentifier,
        };
      }

      return { outcome: 'NOT_VERIFIED' };
    },

    async isClubHeadEligibleEmail(email, trx = db) {
      const row = await this.findActiveByCollegeEmail(email, trx);
      return !!row?.clubHeadEligible;
    },

    async isClubHeadIdentityMismatch(fullName, email, trx = db) {
      const rows = await trx('college_student_roster')
        .where({ is_active: true, club_head_eligible: true })
        .select('full_name', 'college_email');
      const normalized = normalizeEmail(email);
      return rows.some(
        (s) => nameMatches(s.full_name, fullName) && normalizeEmail(s.college_email) !== normalized,
      );
    },

    async assertLinkAllowed(studentIdentifier, userId, trx = db) {
      const row = await this.findActiveByStudentIdentifier(studentIdentifier, trx);
      if (!row) return;
      if (row.linkedUserId && row.linkedUserId !== userId) {
        const err = new Error('STUDENT_ID_ALREADY_LINKED');
        err.code = 'STUDENT_ID_ALREADY_LINKED';
        throw err;
      }
    },

    async linkUser(studentIdentifier, userId, trx = db) {
      const row = await this.findActiveByStudentIdentifier(studentIdentifier, trx);
      if (!row) return null;
      if (row.linkedUserId && row.linkedUserId !== userId) {
        return { conflict: true, linkedUserId: row.linkedUserId };
      }
      const [updated] = await trx('college_student_roster')
        .where({ id: row.id })
        .update({ linked_user_id: userId, updated_at: trx.fn.now() })
        .returning('*');
      return { conflict: false, row: mapRow(updated) };
    },

    async list({ q, page = 1, pageSize = 50, linkedOnly = false }, trx = db) {
      const limit = Math.min(Math.max(pageSize, 1), 200);
      const offset = (Math.max(page, 1) - 1) * limit;
      let query = trx('college_student_roster').where({ is_active: true });
      if (linkedOnly) query = query.whereNotNull('linked_user_id');
      if (q?.trim()) {
        const like = `%${q.trim().toLowerCase()}%`;
        query = query.andWhere((b) => {
          b.whereRaw('lower(student_identifier) like ?', [like])
            .orWhereRaw('lower(full_name) like ?', [like])
            .orWhereRaw('lower(college_email) like ?', [like]);
        });
      }
      const [items, countRow] = await Promise.all([
        query.clone().orderBy('student_identifier').limit(limit).offset(offset).select('*'),
        query.clone().count('* as c').first(),
      ]);
      return {
        items: items.map(mapRow),
        page: Math.max(page, 1),
        pageSize: limit,
        total: Number(countRow.c),
      };
    },

    async stats(trx = db) {
      const [total, linked, clubHeads] = await Promise.all([
        trx('college_student_roster').where({ is_active: true }).count('* as c').first(),
        trx('college_student_roster').where({ is_active: true }).whereNotNull('linked_user_id').count('* as c').first(),
        trx('college_student_roster').where({ is_active: true, club_head_eligible: true }).count('* as c').first(),
      ]);
      return {
        total: Number(total.c),
        linkedAccounts: Number(linked.c),
        clubHeadEligible: Number(clubHeads.c),
      };
    },

    /** Bootstrap from JSON fixture (dev/tests). */
    loadFixtureRows() {
      const fixtures = JSON.parse(
        readFileSync(join(__dirname, '../auth/verification/fixtures/students.mock.json'), 'utf8'),
      );
      return fixtures.map((s) => ({
        studentIdentifier: s.studentIdentifier,
        fullName: s.fullName,
        collegeEmail: s.collegeEmail ?? null,
        program: s.program ?? null,
        clubHeadEligible: s.clubHeadEligible === true,
      }));
    },
  };
}
