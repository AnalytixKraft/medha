import { resolveStateDir } from "../../config/paths.js";
import { GatewayEmailService } from "./service.js";

let cachedService: GatewayEmailService | null = null;
let cachedStateDir: string | null = null;

export async function getGatewayEmailService(): Promise<GatewayEmailService> {
  const stateDir = resolveStateDir();
  if (!cachedService || cachedStateDir !== stateDir) {
    cachedService = await GatewayEmailService.create({ stateDir });
    cachedStateDir = stateDir;
  }
  return cachedService;
}

export function resetGatewayEmailServiceForTest() {
  cachedService = null;
  cachedStateDir = null;
}
