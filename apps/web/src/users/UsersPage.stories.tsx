import { http, HttpResponse } from "msw";
import { fn } from "storybook/test";

import preview from "../../.storybook/preview";
import { admin, link, users } from "../../test/fixtures";
import { SetPasswordLinkDialog } from "./UserDialogs";
import { UsersPage } from "./UsersPage";

const meta = preview.meta({
  title: "Users/UsersPage",
  component: UsersPage,
  args: { currentUserId: admin.id },
});

export const Default = meta.story();

export const OnlyTheAdmin = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/users", () => HttpResponse.json({ users: users.slice(0, 1) })));
  },
});

export const CouldNotLoad = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/users", () => HttpResponse.error()));
  },
});

export const InviteLink = meta.story({
  render: () => <SetPasswordLinkDialog user={users[2]!} link={link} onOpenChange={fn()} />,
});
