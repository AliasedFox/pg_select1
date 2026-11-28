import { afterAll, expect, test } from "bun:test";

import { PgBoss } from "pg-boss";

import { cronEvery, scheduleJob, sendJob, startJobs, stopJobs } from "./jobs";

// Another pg-boss on the same schema, to set up and look at what the one under test leaves.
const inspector = () =>
  new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: "pgboss",
    schedule: false,
    supervise: false,
  });

// Every schedule pg-boss keeps, by its queue's name.
async function schedulesNow(): Promise<Record<string, string>> {
  const check = inspector();
  await check.start();
  const schedules = await check.getSchedules();
  await check.stop();
  return Object.fromEntries(schedules.map((s) => [s.name, s.cron]));
}

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
    // A schedule that's a setting, read as jobs start.
    {
      name: "test-setting",
      schedule: () => Promise.resolve("*/10 * * * *"),
      handler: () => Promise.resolve(),
    },
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

  expect(await schedulesNow()).toEqual({
    "test-hourly": "0 * * * *",
    "test-setting": "*/10 * * * *",
  });
});

test("scheduleJob changes a job's schedule while jobs run", async () => {
  await scheduleJob("test-setting", "*/30 * * * *");
  expect(await schedulesNow()).toEqual({
    "test-hourly": "0 * * * *",
    "test-setting": "*/30 * * * *",
  });
});

test("cronEvery keeps to steps that divide an hour or a day", () => {
  expect(cronEvery(5)).toBe("*/5 * * * *");
  expect(cronEvery(15)).toBe("*/15 * * * *");
  expect(cronEvery(60)).toBe("0 * * * *");
  expect(cronEvery(180)).toBe("0 */3 * * *");
  expect(cronEvery(720)).toBe("0 */12 * * *");
  expect(cronEvery(1440)).toBe("0 0 * * *");
  for (const minutes of [0, 7, 45, 90, 300, 2880]) expect(() => cronEvery(minutes)).toThrow();
});

test("startJobs refuses to start twice", async () => {
  const failure = await startJobs([]).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure instanceof Error && failure.message).toContain("already started");
});
