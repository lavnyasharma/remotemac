FROM node:20-slim AS build
WORKDIR /repo

COPY package.json package-lock.json* ./
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY services/backend/package.json services/backend/package.json
RUN npm ci

COPY packages packages
COPY services/backend services/backend
RUN npm run build --workspace=@remote-mac/types \
  && npm run build --workspace=@remote-mac/protocol \
  && npm run build --workspace=@remote-mac/backend

FROM node:20-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY services/backend/package.json services/backend/package.json
RUN npm ci --omit=dev

COPY --from=build /repo/packages/protocol/dist packages/protocol/dist
COPY --from=build /repo/packages/types/dist packages/types/dist
COPY --from=build /repo/services/backend/dist services/backend/dist
COPY services/backend/migrations services/backend/migrations

EXPOSE 10000
CMD ["sh", "-c", "npm run migrate:up --workspace=@remote-mac/backend && node services/backend/dist/server.js"]
