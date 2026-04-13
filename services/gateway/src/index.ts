import "dotenv/config.js";
import { config } from "./config.js";
import { buildGatewayApp } from "./app.js";
import { validateGatewayProductionConfig } from "./config.js";

const start = async () => {
  try {
    validateGatewayProductionConfig(config);
    const app = await buildGatewayApp();
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info(`Gateway running at http://localhost:${config.port}`);
  } catch (error) {
    // Keep explicit boot-time failure behavior.
    console.error(error);
    process.exit(1);
  }
};

start();
