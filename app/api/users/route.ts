import { ID, Query } from "node-appwrite";
import { z } from "zod";
import { adminServices } from "@/lib/appwrite/server";
import { DATABASE_ID, TABLES } from "@/lib/appwrite/config";
import { firstError, newUserSchema } from "@/lib/maintenance";
import { fail, ok, readJson } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import { toProfile } from "@/lib/server/profiles";
import { currentNames } from "@/lib/server/names";
import { withCurrentName } from "@/lib/names";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

const createUserSchema = newUserSchema.extend({
  dormitory: optionalText(60),
  roomNumber: optionalText(20),
  specialization: optionalText(80),
});

/** List all user profiles. Administrators only. */
export async function GET(request: Request) {
  const guard = await requireCaller(request, ["admin"]);
  if (guard.response) return guard.response;

  const { rows } = await adminServices().tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.users,
    queries: [Query.orderAsc("name"), Query.limit(500)],
  });
  const names = await currentNames();
  const users = rows.map(toProfile).map((p) => withCurrentName(p, names));
  users.sort((a, b) => a.name.localeCompare(b.name));
  return ok({ users });
}

/**
 * Create a user: the sign-in account, its role and its profile.
 * Administrators only. The role is applied here, on the server, as an account
 * label - there is no way for a browser to give itself a role.
 */
export async function POST(request: Request) {
  const guard = await requireCaller(request, ["admin"]);
  if (guard.response) return guard.response;

  const parsed = createUserSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, firstError(parsed));
  const { name, email, password, role, dormitory, roomNumber, specialization } = parsed.data;

  const { users, tablesDB } = adminServices();
  const userId = ID.unique();

  try {
    await users.create({ userId, email, password, name });
  } catch (err) {
    const e = err as { code?: number; type?: string };
    if (e.code === 409) return fail(409, "An account with this email already exists.");
    if (e.type === "password_recently_used" || e.type === "password_personal_data" || e.type === "user_password_mismatch") {
      return fail(400, "That password is not allowed. Choose a different one.");
    }
    if (e.code === 400) return fail(400, "The account could not be created. Check the email address and password.");
    console.error("User creation failed:", e.type ?? err);
    return fail(500, "Could not create the user. Please try again.");
  }

  try {
    await users.updateLabels({ userId, labels: [role] });
    const row = await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.users,
      rowId: userId,
      data: {
        name,
        email,
        role,
        dormitory: role === "student" ? dormitory : null,
        roomNumber: role === "student" ? roomNumber : null,
        specialization: role === "technician" ? specialization : null,
        createdAt: new Date().toISOString(),
      },
      permissions: [],
    });
    return ok({ user: toProfile(row) }, 201);
  } catch (err) {
    // Do not leave a sign-in account without a role and profile behind.
    await users.delete({ userId }).catch(() => {});
    console.error("User setup failed, account removed:", (err as { type?: string })?.type ?? err);
    return fail(500, "Could not create the user. Please try again.");
  }
}
