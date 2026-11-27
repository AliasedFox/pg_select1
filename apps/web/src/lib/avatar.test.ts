import { expect, test } from "bun:test";

import { avatarGradient } from "./avatar";

test("an avatar's gradient is the same for the same seed and differs between seeds", () => {
  expect(avatarGradient("user-1")).toBe(avatarGradient("user-1"));
  expect(avatarGradient("user-1")).not.toBe(avatarGradient("user-2"));
  expect(avatarGradient("user-1")).toStartWith("linear-gradient(");
});
