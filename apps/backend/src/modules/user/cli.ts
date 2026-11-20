import { parseArgs } from "node:util";

import { inviteUserRequest, role } from "@pg_select1/shared";

import { HttpError } from "../../endpoint";
import { inviteUser } from "./service";

/** What `pg_select1 user` prints for `--help` and for a mistake. */
export const userUsage = `Usage: pg_select1 user add <email> [--admin | --role <role>] [--name <name>]

Adds a user and prints the link they set their password with. pg_select1 doesn't send email,
so pass the link on yourself.

  --admin          make them an admin (the same as --role admin)
  --role <role>    admin, editor or viewer (default: viewer)
  --name <name>    their name (default: the part of the email before the @)`;

/**
 * Runs `pg_select1 user ...`: for now only `user add`, the way to make the first admin, since
 * nobody can sign up and only admins can invite.
 *
 * @returns the exit code.
 */
export async function runUserCommand(args: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      admin: { type: "boolean", default: false },
      role: { type: "string" },
      name: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [subcommand, email, ...extra] = positionals;
  if (values.help) {
    console.log(userUsage);
    return 0;
  }
  if (subcommand !== "add" || !email || extra.length > 0) {
    console.error(userUsage);
    return 1;
  }
  if (values.admin && values.role && values.role !== "admin") {
    console.error(`--admin and --role ${values.role} disagree: pick one.`);
    return 1;
  }

  const parsedRole = role.safeParse(values.admin ? "admin" : (values.role ?? "viewer"));
  if (!parsedRole.success) {
    console.error(`Unknown role ${values.role}: use admin, editor or viewer.`);
    return 1;
  }
  const invite = inviteUserRequest.safeParse({
    email,
    name: values.name ?? email.split("@")[0],
    role: parsedRole.data,
  });
  if (!invite.success) {
    console.error(`${email} isn't an email address.`);
    return 1;
  }

  try {
    const { user, link } = await inviteUser(invite.data);
    const expires = new Date(link.expiresAt).toLocaleString();
    console.log(`Added ${user.email}, role ${user.role}.`);
    console.log(`They set their password at this link, until ${expires}:\n\n  ${link.url}\n`);
    return 0;
  } catch (error) {
    if (error instanceof HttpError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}
