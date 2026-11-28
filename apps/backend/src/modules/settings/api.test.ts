import { describe, expect, test } from "bun:test";

import { errorResponse, settings } from "@pg_select1/shared";

import { request, signedInAs } from "../../../test/api";

const admin = await signedInAs("admin");
const editor = await signedInAs("editor");

function patch(body: unknown, cookie: string) {
  return request("/api/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { cookie },
  });
}

async function read(cookie: string) {
  const res = await request("/api/settings", { headers: { cookie } });
  expect(res.status).toBe(200);
  return settings.parse(await res.json());
}

describe("settings", () => {
  test("only admins read and change them", async () => {
    expect((await request("/api/settings")).status).toBe(401);
    expect((await request("/api/settings", { headers: { cookie: editor.cookie } })).status).toBe(
      403,
    );
    expect((await patch({ catalogRefreshMinutes: 30 }, editor.cookie)).status).toBe(403);
  });

  test("the catalog is read every 15 minutes until an admin changes it, and the change is kept", async () => {
    expect(await read(admin.cookie)).toEqual({ catalogRefreshMinutes: 15 });

    const res = await patch({ catalogRefreshMinutes: 60 }, admin.cookie);
    expect(res.status).toBe(200);
    expect(settings.parse(await res.json())).toEqual({ catalogRefreshMinutes: 60 });
    expect(await read(admin.cookie)).toEqual({ catalogRefreshMinutes: 60 });

    // Changing nothing keeps what's there.
    const unchanged = await patch({}, admin.cookie);
    expect(settings.parse(await unchanged.json())).toEqual({ catalogRefreshMinutes: 60 });

    await patch({ catalogRefreshMinutes: 15 }, admin.cookie);
  });

  test("the catalog is read only as often as a cron step can keep to", async () => {
    for (const catalogRefreshMinutes of [0, 7, 45, 90, 2880, "15"]) {
      const res = await patch({ catalogRefreshMinutes }, admin.cookie);
      expect(res.status).toBe(400);
      expect(errorResponse.parse(await res.json()).error).toContain("every 5, 10, 15 or 30");
    }
    expect(await read(admin.cookie)).toEqual({ catalogRefreshMinutes: 15 });
  });
});
