import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { readEnv } from "./env";

// Its own key, derived from PG_SELECT1_SECRET_KEY, so the one Better Auth signs with never
// encrypts anything too.
const key = Buffer.from(
  hkdfSync("sha256", readEnv().PG_SELECT1_SECRET_KEY, "", "pg_select1 connection secrets", 32),
);

// The format's version comes first, so another cipher or key can be told apart later.
const VERSION = "v1";

/**
 * Encrypts a connection's password for its row, with AES-256-GCM under a key derived from
 * `PG_SELECT1_SECRET_KEY` and a new random IV each time, so the same password never encrypts
 * the same way twice.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), encrypted]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/**
 * Decrypts what {@link encryptSecret} made, in the API's memory only.
 *
 * @throws {Error} when it was encrypted under another `PG_SELECT1_SECRET_KEY`, or changed since.
 */
export function decryptSecret(sealed: string): string {
  const [version, iv, tag, encrypted] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || encrypted === undefined) {
    throw new Error("Not a secret pg_select1 encrypted");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
