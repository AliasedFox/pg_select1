import { expect, test } from "bun:test";

import { decryptSecret, encryptSecret } from "./crypto";

test("a secret decrypts to what was encrypted", () => {
  const sealed = encryptSecret("p@ss wörd");

  expect(sealed).not.toContain("p@ss");
  expect(decryptSecret(sealed)).toBe("p@ss wörd");
});

test("the same secret encrypts differently each time", () => {
  expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
});

test("a secret that was changed doesn't decrypt", () => {
  const [version, iv, tag, encrypted] = encryptSecret("secret").split(".");
  const flipped = encrypted!.startsWith("A")
    ? `B${encrypted!.slice(1)}`
    : `A${encrypted!.slice(1)}`;

  expect(() => decryptSecret([version, iv, tag, flipped].join("."))).toThrow();
  expect(() => decryptSecret("not a secret")).toThrow("Not a secret pg_select1 encrypted");
});
