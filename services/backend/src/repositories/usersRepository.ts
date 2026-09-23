import type { Db } from "../db/pool.js";
import type { User } from "@remote-mac/types";

export interface UserWithPasswordHash extends User {
  passwordHash: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: UserRow): UserWithPasswordHash {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createUser(
  db: Db,
  input: { email: string; passwordHash: string },
): Promise<UserWithPasswordHash> {
  const result = await db.query<UserRow>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [input.email.toLowerCase(), input.passwordHash],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create user");
  return mapRow(row);
}

export async function findUserByEmail(db: Db, email: string): Promise<UserWithPasswordHash | null> {
  const result = await db.query<UserRow>(`SELECT * FROM users WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function findUserById(db: Db, id: string): Promise<UserWithPasswordHash | null> {
  const result = await db.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}
