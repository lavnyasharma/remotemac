import { createHash } from "node:crypto";

/** SHA-256 hex digest, used for hashing short-lived tokens/codes we need to equality-match in the DB. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
