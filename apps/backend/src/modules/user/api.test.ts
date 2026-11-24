import { describe, expect, test } from "bun:test";

import { inviteUserResponse, me, setPasswordLink, user, userList } from "@pg_select1/shared";

import { request, signedInAs, signIn, tokenOf } from "../../../test/api";

function json(body: unknown, cookie: string, method = "POST"): RequestInit {
  return { method, body: JSON.stringify(body), headers: { cookie } };
}

async function setPassword(url: string, newPassword: string): Promise<Response> {
  return request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: tokenOf(url), newPassword }),
  });
}

describe("signing in", () => {
  test("GET /api/me answers 401 when nobody is signed in", async () => {
    const res = await request("/api/me");
    expect(res.status).toBe(401);
  });

  test("GET /api/me answers who's signed in", async () => {
    const viewer = await signedInAs("viewer");

    const res = await request("/api/me", { headers: { cookie: viewer.cookie } });

    expect(res.status).toBe(200);
    const body = me.parse(await res.json());
    expect(body).toMatchObject({ id: viewer.id, email: viewer.email, role: "viewer" });
  });

  test("nobody can sign up", async () => {
    const res = await request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({
        email: "new@example.com",
        password: "a long enough password",
        name: "New",
      }),
    });

    expect(res.ok).toBe(false);
    expect(await signIn("new@example.com", "a long enough password")).toBeNull();
  });

  test("asking for a password reset by email is off", async () => {
    const viewer = await signedInAs("viewer");

    const res = await request("/api/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email: viewer.email }),
    });

    expect(res.ok).toBe(false);
  });
});

describe("only admins manage users", () => {
  test("GET /api/users answers 401 to nobody and 403 to an editor", async () => {
    const editor = await signedInAs("editor");

    expect((await request("/api/users")).status).toBe(401);
    expect((await request("/api/users", { headers: { cookie: editor.cookie } })).status).toBe(403);
  });

  test("an editor can't invite anyone", async () => {
    const editor = await signedInAs("editor");

    const res = await request(
      "/api/users",
      json({ email: "sneaky@example.com", name: "Sneaky", role: "admin" }, editor.cookie),
    );

    expect(res.status).toBe(403);
  });
});

describe("inviting", () => {
  test("an admin invites someone, who sets a password from the link and signs in", async () => {
    const admin = await signedInAs("admin");
    const email = `Invited-${crypto.randomUUID().slice(0, 8)}@Example.com`;

    const res = await request(
      "/api/users",
      json({ email, name: "Invited", role: "editor" }, admin.cookie),
    );

    expect(res.status).toBe(201);
    const invite = inviteUserResponse.parse(await res.json());
    expect(invite.user).toMatchObject({
      email: email.toLowerCase(),
      role: "editor",
      status: "invited",
    });
    expect(invite.link.url).toStartWith("http://localhost:5190/set-password?token=");
    expect(await signIn(email.toLowerCase(), "the password they picked")).toBeNull();

    expect((await setPassword(invite.link.url, "the password they picked")).ok).toBe(true);

    const cookie = await signIn(email.toLowerCase(), "the password they picked");
    expect(cookie).not.toBeNull();
    const list = userList.parse(
      await (await request("/api/users", { headers: { cookie: admin.cookie } })).json(),
    );
    expect(list.users.find((u) => u.id === invite.user.id)?.status).toBe("active");
  });

  test("an invite link works only once", async () => {
    const admin = await signedInAs("admin");
    const res = await request(
      "/api/users",
      json(
        {
          email: `once-${crypto.randomUUID().slice(0, 8)}@example.com`,
          name: "Once",
          role: "viewer",
        },
        admin.cookie,
      ),
    );
    const { link } = inviteUserResponse.parse(await res.json());

    expect((await setPassword(link.url, "first password here")).ok).toBe(true);
    expect((await setPassword(link.url, "second password here")).ok).toBe(false);
  });

  test("a new link makes the earlier one stop working", async () => {
    const admin = await signedInAs("admin");
    const res = await request(
      "/api/users",
      json(
        {
          email: `relink-${crypto.randomUUID().slice(0, 8)}@example.com`,
          name: "Relink",
          role: "viewer",
        },
        admin.cookie,
      ),
    );
    const invite = inviteUserResponse.parse(await res.json());

    const again = await request(
      `/api/users/${invite.user.id}/set-password-link`,
      json({}, admin.cookie),
    );
    expect(again.status).toBe(200);
    const link = setPasswordLink.parse(await again.json());

    expect((await setPassword(invite.link.url, "the old link's password")).ok).toBe(false);
    expect((await setPassword(link.url, "the new link's password")).ok).toBe(true);
  });

  test("inviting an email that already has an account answers 409", async () => {
    const admin = await signedInAs("admin");
    const viewer = await signedInAs("viewer");

    const res = await request(
      "/api/users",
      json({ email: viewer.email.toUpperCase(), name: "Again", role: "viewer" }, admin.cookie),
    );

    expect(res.status).toBe(409);
  });

  test("an invite needs an email address and a known role", async () => {
    const admin = await signedInAs("admin");

    const badEmail = await request(
      "/api/users",
      json({ email: "nope", name: "X", role: "viewer" }, admin.cookie),
    );
    const badRole = await request(
      "/api/users",
      json({ email: "x@example.com", name: "X", role: "owner" }, admin.cookie),
    );

    expect(badEmail.status).toBe(400);
    expect(badRole.status).toBe(400);
  });
});

describe("changing and deleting", () => {
  test("an admin changes someone's name and role", async () => {
    const admin = await signedInAs("admin");
    const viewer = await signedInAs("viewer");

    const res = await request(
      `/api/users/${viewer.id}`,
      json({ name: "Renamed", role: "editor" }, admin.cookie, "PATCH"),
    );

    expect(res.status).toBe(200);
    expect(user.parse(await res.json())).toMatchObject({
      name: "Renamed",
      role: "editor",
      status: "active",
    });
    const meRes = await request("/api/me", { headers: { cookie: viewer.cookie } });
    expect(me.parse(await meRes.json()).role).toBe("editor");
  });

  test("an admin deletes someone, who is signed out", async () => {
    const admin = await signedInAs("admin");
    const viewer = await signedInAs("viewer");

    const res = await request(`/api/users/${viewer.id}`, {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });

    expect(res.status).toBe(204);
    expect((await request("/api/me", { headers: { cookie: viewer.cookie } })).status).toBe(401);
    expect(await signIn(viewer.email, viewer.password)).toBeNull();
  });

  test("an admin can't delete themselves", async () => {
    const admin = await signedInAs("admin");

    const res = await request(`/api/users/${admin.id}`, {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });

    expect(res.status).toBe(400);
  });

  test("an unknown user answers 404", async () => {
    const admin = await signedInAs("admin");

    const missing = await request(
      `/api/users/${Bun.randomUUIDv7()}`,
      json({ name: "X" }, admin.cookie, "PATCH"),
    );
    const notAnId = await request("/api/users/nope", json({ name: "X" }, admin.cookie, "PATCH"));

    expect(missing.status).toBe(404);
    expect(notAnId.status).toBe(400);
  });
});

describe("one's own profile", () => {
  test("anyone signed in changes their own name, and only that", async () => {
    const viewer = await signedInAs("viewer");

    const res = await request(
      "/api/me",
      json({ name: "  New Name  ", role: "admin", email: "x@example.com" }, viewer.cookie, "PATCH"),
    );

    expect(res.status).toBe(200);
    expect(me.parse(await res.json())).toEqual({
      id: viewer.id,
      email: viewer.email,
      name: "New Name",
      role: "viewer",
    });
    const meRes = await request("/api/me", { headers: { cookie: viewer.cookie } });
    expect(me.parse(await meRes.json()).name).toBe("New Name");
  });

  test("a name can't be blank, and nobody signed out can change one", async () => {
    const viewer = await signedInAs("viewer");

    const blank = await request("/api/me", json({ name: "   " }, viewer.cookie, "PATCH"));
    const signedOut = await request("/api/me", { method: "PATCH", body: '{"name":"X"}' });

    expect(blank.status).toBe(400);
    expect(signedOut.status).toBe(401);
  });

  test("changing one's password takes the current one, and signs out everywhere else", async () => {
    const editor = await signedInAs("editor");
    const elsewhere = await signIn(editor.email, editor.password);

    const res = await request(
      "/api/auth/change-password",
      json(
        {
          currentPassword: editor.password,
          newPassword: "a brand new password",
          revokeOtherSessions: true,
        },
        editor.cookie,
      ),
    );

    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((c) => c.includes("session_token"));
    expect((await request("/api/me", { headers: { cookie: cookie!.split(";")[0]! } })).status).toBe(
      200,
    );
    expect((await request("/api/me", { headers: { cookie: elsewhere! } })).status).toBe(401);
    expect(await signIn(editor.email, editor.password)).toBeNull();
    expect(await signIn(editor.email, "a brand new password")).not.toBeNull();
  });

  test("changing one's password is refused with the wrong current one", async () => {
    const editor = await signedInAs("editor");

    const res = await request(
      "/api/auth/change-password",
      json(
        { currentPassword: "not my password", newPassword: "a brand new password" },
        editor.cookie,
      ),
    );

    expect(res.status).toBe(400);
    expect(await signIn(editor.email, editor.password)).not.toBeNull();
  });
});
