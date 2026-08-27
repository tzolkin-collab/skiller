import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../.env') });

const redisConnection = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
});

const SKILL_QUEUE_NAME = 'skill-generation';
const queue = new Queue(SKILL_QUEUE_NAME, { connection: redisConnection });

async function check() {
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const failed = await queue.getFailedCount();
  const delayed = await queue.getDelayedCount();
  console.log(`Waiting: ${waiting}, Active: ${active}, Failed: ${failed}, Delayed: ${delayed}`);

  if (active > 0) {
    const activeJobs = await queue.getActive();
    for (const job of activeJobs) {
      console.log(`Active job ${job.id}: data=${JSON.stringify(job.data)}, progress=${job.progress}`);
    }
  }

  if (failed > 0) {
    const failedJobs = await queue.getFailed(0, 2);
    for (const job of failedJobs) {
      console.log(`Failed job ${job.id}: ${job.failedReason}`);
    }
  }

  process.exit(0);
}

check().catch(console.error);
