import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp({ env });

  try {
    await app.listen({ host: "0.0.0.0", port: env.PORT });
  } catch (error) {
    app.log.error(error, "Failed to start server");
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      app.log.info({ signal }, "Shutting down");
      void app.close().then(() => process.exit(0));
    });
  }
}

void main();
