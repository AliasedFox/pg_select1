import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";

import { me } from "@pg_select1/shared";

import { request, signIn, tokenOf } from "../../../test/api";
import { runUserCommand } from "./cli";

let log: ReturnType<typeof spyOn<Console, "log">>;
let error: ReturnType<typeof spyOn<Console, "error">>;

beforeEach(() => {
  log = spyOn(console, "log").mockImplementation(() => undefined);
  error = spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  log.mockRestore();
  error.mockRestore();
});

function printed(): string {
  return log.mock.calls.flat().join("\n");
}

test("user add --admin adds an admin who sets a password from the printed link", async () => {
  const email = `first-${crypto.randomUUID().slice(0, 8)}@example.com`;

  expect(await runUserCommand(["add", email, "--admin"])).toBe(0);

  const url = /http:\/\/\S+/.exec(printed())?.[0];
  expect(url).toBeDefined();
  const res = await request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: tokenOf(url!), newPassword: "the first admin's password" }),
  });
  expect(res.ok).toBe(true);
  const cookie = await signIn(email, "the first admin's password");
  const body = me.parse(await (await request("/api/me", { headers: { cookie: cookie! } })).json());
  expect(body).toMatchObject({ email, name: email.split("@")[0], role: "admin" });
});

test("user add refuses an email that already has an account", async () => {
  const email = `twice-${crypto.randomUUID().slice(0, 8)}@example.com`;
  expect(await runUserCommand(["add", email])).toBe(0);

  expect(await runUserCommand(["add", email, "--role", "editor"])).toBe(1);
  expect(error.mock.calls.flat().join()).toContain("already has an account");
});

test("user add refuses an unknown role and a missing email", async () => {
  expect(await runUserCommand(["add", "someone@example.com", "--role", "owner"])).toBe(1);
  expect(await runUserCommand(["add"])).toBe(1);
  expect(await runUserCommand(["add", "not-an-email"])).toBe(1);
});
