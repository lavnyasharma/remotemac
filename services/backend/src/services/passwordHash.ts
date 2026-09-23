import argon2 from "argon2";
import { randomUUID } from "node:crypto";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomUUID());
  return dummyHashPromise;
}

/**
 * Verifies a password against a user's hash, or against a precomputed dummy
 * hash when no user was found — keeping login response time independent of
 * whether the email exists, so timing can't be used to enumerate accounts.
 */
export async function verifyPasswordOrDummy(
  hash: string | undefined,
  password: string,
): Promise<boolean> {
  const target = hash ?? (await getDummyHash());
  return verifyPassword(target, password);
}
