import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { CLUB_ROLES } from '../../shared/access.js';
import * as s from './schemas.js';

// LLD §4.8. TEAM reads here mean club role holders: organizers see only the finance summary
// (OQ-38 APPROVED). Club-scoped routes authorize in middleware; resource routes (/fundraisers/:id,
// /tasks/:taskId) authorize in the service after loading the resource's club.

export function createFundraiserRoutes({ controller, requireAuth, requireClubRole }) {
  const r = Router();
  r.get('/clubs/:clubId/fundraisers', requireAuth, validate({ params: s.clubIdParams, query: s.listFundraisersQuery }), requireClubRole(CLUB_ROLES), controller.list);
  r.post('/clubs/:clubId/fundraisers', requireAuth, validate({ params: s.clubIdParams, body: s.createFundraiserBody }), requireClubRole(['CLUB_HEAD']), controller.create);
  r.patch('/fundraisers/:id', requireAuth, validate({ params: s.fundraiserIdParams, body: s.patchFundraiserBody }), controller.update);
  r.get('/fundraisers/:id/overview', requireAuth, validate({ params: s.fundraiserIdParams }), controller.overview);
  r.post('/fundraisers/:id/tasks', requireAuth, validate({ params: s.fundraiserIdParams, body: s.createTaskBody }), controller.createTask);
  r.patch('/tasks/:taskId', requireAuth, validate({ params: s.taskIdParams, body: s.patchTaskBody }), controller.updateTask);
  r.get('/me/tasks', requireAuth, validate({ query: s.myTasksQuery }), controller.myTasks);
  return r;
}
