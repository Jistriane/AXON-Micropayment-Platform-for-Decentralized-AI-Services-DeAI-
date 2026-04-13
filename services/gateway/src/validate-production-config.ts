import { config } from "dotenv";
import { resolve } from "path";
import { validateGatewayProductionProfile } from "./config.js";

// Load .env.local for development/local validation
config({ path: resolve(process.cwd(), ".env.local") });

try {
  validateGatewayProductionProfile();
  // eslint-disable-next-line no-console
  console.log("Gateway production configuration is valid.");
  process.exit(0);
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
