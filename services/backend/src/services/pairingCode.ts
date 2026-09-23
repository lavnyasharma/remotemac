import { randomInt } from "node:crypto";
import { sha256Hex } from "./hash.js";

const PAIRING_CODE_TTL_SECONDS = 5 * 60;

export interface GeneratedPairingCode {
  /** The 6-digit code shown to the user. Never stored directly — only its hash is. */
  code: string;
  hash: string;
  expiresAt: Date;
}

export function generatePairingCode(): GeneratedPairingCode {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  return {
    code,
    hash: sha256Hex(code),
    expiresAt: new Date(Date.now() + PAIRING_CODE_TTL_SECONDS * 1000),
  };
}
