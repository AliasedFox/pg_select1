import type { Job as PgBossJob, Queue } from "pg-boss";

/**
 * One kind of background job: its queue, what runs each batch of its jobs and, for a job that
 * runs on its own, when. pg-boss may run a job twice, after a crash or a timeout, so handlers
 * must be safe to run again.
 */
export interface Job {
  /** The queue's name, which jobs are sent to. */
  name: string;
  /** How the queue retries, expires and keeps its jobs, set when it's first created. */
  queue?: Omit<Queue, "name">;
  /**
   * A cron expression, in UTC, to send a job on, as for housekeeping, or what reads it as jobs
   * start, for one that's a setting; `scheduleJob` changes it while they run.
   */
  schedule?: string | (() => Promise<string>);
  /** Whether to send a job as jobs start too, as for what's kept in memory, which starts empty. */
  runOnStart?: boolean;
  /** Runs a batch of the queue's jobs; their data is whatever was sent, so parse it with Zod. */
  handler: (jobs: PgBossJob<unknown>[]) => Promise<void>;
}
