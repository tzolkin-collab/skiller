import { Hono } from 'hono';
import { skillQueue } from '../queue/queue.js';
import { getErrorMessage } from '../lib/errors.js';

const queueRouter = new Hono();

queueRouter.get('/status', async (c) => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      skillQueue.getWaitingCount(),
      skillQueue.getActiveCount(),
      skillQueue.getCompletedCount(),
      skillQueue.getFailedCount()
    ]);

    return c.json({
      waiting,
      active,
      completed,
      failed
    });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

queueRouter.get('/jobs/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    let job = await skillQueue.getJob(jobId);

    if (!job) {
      const activeJobs = await skillQueue.getJobs(['active', 'waiting', 'delayed']);
      job = activeJobs.find(j => j.data.skillId === jobId);
    }

    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    const state = await job.getState();
    const progress = job.progress;

    return c.json({ id: job.id, state, progress });
  } catch (error: unknown) {
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

export { queueRouter };
