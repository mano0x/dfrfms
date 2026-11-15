/** User profile rows (name, role and role-specific details). Server only. */
import { adminServices } from "../appwrite/server";
import { DATABASE_ID, TABLES } from "../appwrite/config";
import type { Role } from "../maintenance";

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  dormitory: string | null;
  roomNumber: string | null;
  specialization: string | null;
  createdAt: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toProfile(row: any): Profile {
  return {
    id: row.$id,
    name: row.name,
    email: row.email,
    role: row.role,
    dormitory: row.dormitory ?? null,
    roomNumber: row.roomNumber ?? null,
    specialization: row.specialization ?? null,
    createdAt: row.createdAt ?? null,
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  try {
    const row = await adminServices().tablesDB.getRow({ databaseId: DATABASE_ID, tableId: TABLES.users, rowId: userId });
    return toProfile(row);
  } catch {
    return null;
  }
}
