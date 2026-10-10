import { toFundraiserDto, toFundraiserListItem, toFundraiserMoneyDto, toTaskDto } from './dto.js';

export function createFundraiserController({ fundraisers }) {
  return Object.freeze({
    async list(req, res) {
      const rows = await fundraisers.list(req.valid.params.clubId, req.valid.query);
      res.json({ data: rows.map((r) => toFundraiserListItem(r.fundraiser, { progress: r.progress, money: r.money })) });
    },
    async overview(req, res) {
      const { fundraiser, tasks, progress, money, names } = await fundraisers.overview(req.actor, req.valid.params.id);
      res.json({
        data: {
          fundraiser: toFundraiserDto(fundraiser),
          progressPct: progress.progressPct,
          health: progress.health,
          timeElapsedPct: progress.timeElapsedPct,
          counts: progress.counts,
          tasks: tasks.map((t) => toTaskDto(t, names, { overdue: progress.overdueIds.has(t.id) })),
          money: toFundraiserMoneyDto(money),
        },
      });
    },
    async create(req, res) {
      res.status(201).json({ data: toFundraiserDto(await fundraisers.create(req.actor, req.valid.params.clubId, req.valid.body)) });
    },
    async update(req, res) {
      res.json({ data: toFundraiserDto(await fundraisers.update(req.actor, req.valid.params.id, req.valid.body)) });
    },
    async createTask(req, res) {
      const { task, names } = await fundraisers.createTask(req.actor, req.valid.params.id, req.valid.body);
      res.status(201).json({ data: toTaskDto(task, names) });
    },
    async updateTask(req, res) {
      const { task, names } = await fundraisers.updateTask(req.actor, req.valid.params.taskId, req.valid.body);
      res.json({ data: toTaskDto(task, names) });
    },
    async myTasks(req, res) {
      const { rows, names } = await fundraisers.myTasks(req.actor, req.valid.query);
      res.json({
        data: rows.map((t) => ({
          ...toTaskDto(t, names, { overdue: t.overdue }),
          fundraiserName: t.fundraiser_name,
          fundraiserStatus: t.fundraiser_status,
        })),
      });
    },
  });
}
