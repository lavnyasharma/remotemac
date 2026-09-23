import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { sha256Hex } from "./hash.js";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SignedAccessToken {
  token: string;
  expiresAt: Date;
}

export async function signAccessToken(userId: string, secret: string): Promise<SignedAccessToken> {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt };
}

export class InvalidTokenError extends Error {}

export async function verifyAccessToken(token: string, secret: string): Promise<{ userId: string }> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(secret)));
  } catch (error) {
    throw new InvalidTokenError("Access token is invalid or expired", { cause: error });
  }
  if (typeof payload.sub !== "string") {
    throw new InvalidTokenError("Access token is missing a subject");
  }
  return { userId: payload.sub };
}

export interface GeneratedRefreshToken {
  /** The opaque token handed to the client. Never stored directly — only its hash is. */
  token: string;
  hash: string;
  expiresAt: Date;
}

export function generateRefreshToken(): GeneratedRefreshToken {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: sha256Hex(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  };
}
