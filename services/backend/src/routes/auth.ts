import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db/pool.js";
import { registerBodySchema, loginBodySchema, refreshBodySchema } from "../validation/auth.js";
import { createUser, findUserByEmail, findUserById } from "../repositories/usersRepository.js";
import { hashPassword, verifyPasswordOrDummy } from "../services/passwordHash.js";
import { signAccessToken, generateRefreshToken } from "../services/tokens.js";
import { sha256Hex } from "../services/hash.js";
import {
  createRefreshToken,
  findActiveRefreshTokenByHash,
  revokeRefreshToken,
} from "../repositories/refreshTokensRepository.js";

export interface AuthRoutesOptions {
  db: Db;
  jwtSecret: string;
}

interface PgUniqueViolation {
  code: string;
}

function isUniqueViolation(error: unknown): error is PgUniqueViolation {
  return typeof error === "object" && error !== null && (error as PgUniqueViolation).code === "23505";
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, opts) => {
  const { db, jwtSecret } = opts;

  app.post("/auth/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body" });
    const { email, password } = parsed.data;

    const passwordHash = await hashPassword(password);

    let user;
    try {
      user = await createUser(db, { email, passwordHash });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Email already registered" });
      }
      throw error;
    }

    const accessToken = await signAccessToken(user.id, jwtSecret);
    const refresh = generateRefreshToken();
    await createRefreshToken(db, {
      userId: user.id,
      deviceId: null,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    });

    return reply.code(201).send({
      user: { id: user.id, email: user.email },
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
      refreshToken: refresh.token,
    });
  });

  app.post("/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body" });
    const { email, password } = parsed.data;

    const user = await findUserByEmail(db, email);
    const valid = await verifyPasswordOrDummy(user?.passwordHash, password);
    if (!user || !valid) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const accessToken = await signAccessToken(user.id, jwtSecret);
    const refresh = generateRefreshToken();
    await createRefreshToken(db, {
      userId: user.id,
      deviceId: null,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    });

    return reply.send({
      user: { id: user.id, email: user.email },
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
      refreshToken: refresh.token,
    });
  });

  app.post("/auth/refresh", async (request, reply) => {
    const parsed = refreshBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body" });

    const tokenHash = sha256Hex(parsed.data.refreshToken);
    const existing = await findActiveRefreshTokenByHash(db, tokenHash);
    if (!existing) return reply.code(401).send({ error: "Invalid or expired refresh token" });

    const user = await findUserById(db, existing.userId);
    if (!user) return reply.code(401).send({ error: "Invalid or expired refresh token" });

    const accessToken = await signAccessToken(user.id, jwtSecret);
    const rotated = generateRefreshToken();
    const newToken = await createRefreshToken(db, {
      userId: user.id,
      deviceId: existing.deviceId,
      tokenHash: rotated.hash,
      expiresAt: rotated.expiresAt,
    });
    await revokeRefreshToken(db, existing.id, newToken.id);

    return reply.send({
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
      refreshToken: rotated.token,
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    const parsed = refreshBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body" });

    const tokenHash = sha256Hex(parsed.data.refreshToken);
    const existing = await findActiveRefreshTokenByHash(db, tokenHash);
    if (existing) {
      await revokeRefreshToken(db, existing.id);
    }

    return reply.code(204).send();
  });
};
