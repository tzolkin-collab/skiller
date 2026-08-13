import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const redisConnection = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null
});

export const SKILL_QUEUE_NAME = 'skill-generation';

export const skillQueue = new Queue(SKILL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const skillQueueEvents = new QueueEvents(SKILL_QUEUE_NAME, { connection: redisConnection });
