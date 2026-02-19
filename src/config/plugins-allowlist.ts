import type { MedhaConfig } from "./config.js";

export function ensurePluginAllowlisted(cfg: MedhaConfig, pluginId: string): MedhaConfig {
  const allow = cfg.plugins?.allow;
  if (!Array.isArray(allow) || allow.includes(pluginId)) {
    return cfg;
  }
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      allow: [...allow, pluginId],
    },
  };
}
