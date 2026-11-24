import { defineContract, enumType, member } from "@prisma/orm-postgres/contract-builder";

/**
 * What a user may do: an admin manages users (and, later, connections); editors and viewers
 * don't. Editor and viewer behave the same until there are saved queries and alerts to edit.
 */
const Role = enumType(
  "Role",
  { codecId: "pg/text@1" },
  member("admin", "admin"),
  member("editor", "editor"),
  member("viewer", "viewer"),
);

/**
 * The schema of pg_select1's own database, every table in the `public` schema.
 *
 * After changing it, run `prisma contract emit`, then `prisma migration plan --name <change>`
 * and `prisma db migrate`. Target databases are never described here.
 *
 * `User`, `Session`, `Account` and `Verification` are Better Auth's tables: it reads and writes
 * them through `pg` (`src/auth.ts` maps its field names to these columns), and Prisma owns
 * their DDL like every other table's.
 */
export const contract = defineContract(
  { naming: { columns: "snake_case" } },
  ({ field, model, rel, type, gen }) => {
    const Id = field.column(type.Uuid()).id().onCreate(gen.uuid(7));
    const UserId = field.column(type.Uuid());
    const CreatedAt = field.column(type.temporal.CreatedAt());
    const UpdatedAt = field.column(type.temporal.UpdatedAt());

    const User = model("User", {
      fields: {
        id: Id,
        name: field.column(type.String()),
        email: field.column(type.String()).unique(),
        emailVerified: field.column(type.Boolean()).default(false),
        image: field.column(type.String()).optional(),
        role: field.namedType(Role).default("viewer"),
        createdAt: CreatedAt,
        updatedAt: UpdatedAt,
      },
    }).sql({ table: "users" });

    const Session = model("Session", {
      fields: {
        id: Id,
        token: field.column(type.String()).unique(),
        userId: UserId,
        expiresAt: field.column(type.DateTime()),
        ipAddress: field.column(type.String()).optional(),
        userAgent: field.column(type.String()).optional(),
        createdAt: CreatedAt,
        updatedAt: UpdatedAt,
      },
      relations: {
        user: rel
          .belongsTo(User, { from: "userId", to: "id" })
          .sql({ fk: { onDelete: "cascade" } }),
      },
    }).sql({ table: "sessions" });

    // One per way a user signs in: `credential` holds the password hash, an OIDC provider its tokens.
    const Account = model("Account", {
      fields: {
        id: Id,
        userId: UserId,
        providerId: field.column(type.String()),
        accountId: field.column(type.String()),
        password: field.column(type.String()).optional(),
        accessToken: field.column(type.String()).optional(),
        refreshToken: field.column(type.String()).optional(),
        idToken: field.column(type.String()).optional(),
        accessTokenExpiresAt: field.column(type.DateTime()).optional(),
        refreshTokenExpiresAt: field.column(type.DateTime()).optional(),
        scope: field.column(type.String()).optional(),
        createdAt: CreatedAt,
        updatedAt: UpdatedAt,
      },
      relations: {
        user: rel
          .belongsTo(User, { from: "userId", to: "id" })
          .sql({ fk: { onDelete: "cascade" } }),
      },
    }).sql({ table: "accounts" });

    // Short-lived tokens, such as the one in an invite or password reset link.
    const Verification = model("Verification", {
      fields: {
        id: Id,
        identifier: field.column(type.String()),
        value: field.column(type.String()),
        expiresAt: field.column(type.DateTime()),
        createdAt: CreatedAt,
        updatedAt: UpdatedAt,
      },
    }).sql(({ cols, constraints }) => ({
      table: "verifications",
      indexes: [constraints.index([cols.identifier])],
    }));

    return { enums: { Role }, models: { User, Session, Account, Verification } };
  },
);
