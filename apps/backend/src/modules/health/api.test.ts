import { expect, test } from "bun:test";

import { healthResponse } from "@select1/shared";

import { request } from "../../../test/api";

test("GET /health answers ok when select1's database is reachable", async () => {
  const res = await request("/health");

  expect(res.status).toBe(200);
  const body = healthResponse.parse(await res.json());
  expect(body.status).toBe("ok");
  expect(body.database.ok).toBe(true);
});
