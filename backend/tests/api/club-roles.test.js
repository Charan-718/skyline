import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp } from '../helpers/testApp.js';
import { getTestDb, migrateTestDb, truncateTestDb } from '../helpers/testDb.js';
import { createUser, createClub, verifyStudent } from '../helpers/factories.js';

describe('club head assignment', () => {
  let container;
  let db;

  beforeAll(async () => {
    db = getTestDb();
    await migrateTestDb();
    await truncateTestDb();
    ({ container } = createTestApp());
  });

  it('rejects unverified user as club head via CLI', async () => {
    const outsider = await createUser(db, { email: `outsider-${Date.now()}@example.com` });
    const club = await createClub(db);

    await expect(
      container.services.clubService.assignClubHeadViaCli(club.id, outsider.email),
    ).rejects.toMatchObject({ code: 'NOT_VERIFIED', httpStatus: 403 });
  });

  it('blocks verified student who is not club-head eligible', async () => {
    const student = await createUser(db, {
      email: `ravi-${Date.now()}@skyline.ac.in`,
      fullName: 'Ravi Kumar',
    });
    await verifyStudent(db, student.id, 'SRKR2022ME042', 'Ravi Kumar');
    const club = await createClub(db);

    await expect(
      container.services.clubService.assignClubHeadViaCli(club.id, student.email),
    ).rejects.toMatchObject({ code: 'CLUB_HEAD_NOT_ELIGIBLE', httpStatus: 403 });
  });

  it('assigns roster club head email when verified', async () => {
    const student = await createUser(db, {
      email: 'clubhead@skyline.ac.in',
      fullName: 'Club Head User',
    });
    await verifyStudent(db, student.id, 'SKY2023AD001', 'Club Head User');
    const club = await createClub(db);

    const assignment = await container.services.clubService.assignClubHeadViaCli(club.id, student.email);
    expect(assignment.role).toBe('CLUB_HEAD');
  });
});
