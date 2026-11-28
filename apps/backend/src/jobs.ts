import { PgBoss, type SendOptions } from "pg-boss";

import { readEnv } from "./env";
import type { Job } from "./job";

// pg-boss's tables, in pg_select1's database but not Prisma's: never put them in the contract.
const SCHEMA = "pgboss";

let boss: PgBoss | undefined;

/**
 * Starts pg-boss on pg_select1's database and works every job's queue: creates its `pgboss`
 * schema or migrates it on first start, creates the queues that don't exist yet, sets or
 * removes schedules so they match `jobs`, and sends a job for each that runs on start.
 *
 * A queue's options apply only when it's created; changing them later takes `updateQueue`.
 *
 * @throws {Error} when pg-boss can't reach the database or install its schema.
 */
export async function startJobs(jobs: readonly Job[]): Promise<void> {
  if (boss) throw new Error("Jobs have already started");
  const instance = new PgBoss({
    connectionString: readEnv().DATABASE_URL,
    schema: SCHEMA,
    application_name: "pg_select1 jobs",
  });
  // Without a listener an `error` event would crash the process; pg-boss retries on its own.
  instance.on("error", (error) => {
    console.error("pg-boss:", error);
  });
  await instance.start();
  boss = instance;

  for (const job of jobs) {
    if (!(await instance.getQueue(job.name))) await instance.createQueue(job.name, job.queue);
    await instance.work(job.name, job.handler);
  }

  // Schedules live in the database, so one whose job no longer has one would go on sending.
  const schedules = new Map(
    jobs.flatMap((job) => (job.schedule ? [[job.name, job.schedule]] : [])),
  );
  for (const existing of await instance.getSchedules()) {
    if (!schedules.has(existing.name)) await instance.unschedule(existing.name, existing.key);
  }
  for (const [name, cron] of schedules) await instance.schedule(name, cron);

  for (const job of jobs) if (job.runOnStart) await instance.send(job.name, null);
}

/**
 * Sends a job to a queue that {@link startJobs} created, answering its id, or `null` when pg-boss
 * skipped it, as for a singleton already queued.
 *
 * @throws {Error} when jobs haven't started.
 */
export async function sendJob(
  name: string,
  data: object | null = null,
  options?: SendOptions,
): Promise<string | null> {
  if (!boss) throw new Error("Jobs haven't started");
  return boss.send(name, data, options);
}

/**
 * Stops pg-boss, letting the jobs that are running finish for up to 30 seconds, and closes its
 * pool. Does nothing when it hasn't started.
 */
export async function stopJobs(): Promise<void> {
  const instance = boss;
  boss = undefined;
  await instance?.stop({ graceful: true });
}
