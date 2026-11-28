import { afterAll, expect, test } from "bun:test";

import { PgBoss } from "pg-boss";

import { sendJob, startJobs, stopJobs } from "./jobs";

// Another pg-boss on the same schema, to set up and look at what the one under test leaves.
const inspector = () =>
  new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: "pgboss",
    schedule: false,
    supervise: false,
  });

const received: unknown[] = [];
let done: () => void;
const ran = new Promise<void>((resolve) => {
  done = resolve;
});
let started: () => void;
const ranOnStart = new Promise<void>((resolve) => {
  started = resolve;
});

afterAll(async () => {
  await stopJobs();
});

test("startJobs installs pg-boss in pgboss, works queues, keeps schedules to the jobs' and runs those that run on start", async () => {
  // A schedule left by a job that's gone, which starting should remove.
  const other = inspector();
  await other.start();
  await other.createQueue("test-gone");
  await other.schedule("test-gone", "0 * * * *");
  await other.stop();

  await startJobs([
    {
      name: "test-echo",
      handler: (jobs) => {
        received.push(...jobs.map((job) => job.data));
        done();
        return Promise.resolve();
      },
    },
    { name: "test-hourly", schedule: "0 * * * *", handler: () => Promise.resolve() },
    {
      name: "test-on-start",
      runOnStart: true,
      handler: () => {
        started();
        return Promise.resolve();
      },
    },
  ]);
  // Sent as jobs start, without anyone sending it.
  await ranOnStart;

  expect(await sendJob("test-echo", { hello: "world" })).toBeString();
  await ran;
  expect(received).toEqual([{ hello: "world" }]);

  const check = inspector();
  await check.start();
  const schedules = await check.getSchedules();
  await check.stop();
  expect(schedules.map((s) => s.name)).toEqual(["test-hourly"]);
});

test("startJobs refuses to start twice", async () => {
  const failure = await startJobs([]).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure instanceof Error && failure.message).toContain("already started");
});
