import type { MedhaConfig } from "../config/config.js";

export function applyOnboardingLocalWorkspaceConfig(
  baseConfig: MedhaConfig,
  workspaceDir: string,
): MedhaConfig {
  return {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: workspaceDir,
      },
    },
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
  };
}
