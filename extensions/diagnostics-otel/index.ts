import type { MedhaPluginApi } from "medha/plugin-sdk";
import { emptyPluginConfigSchema } from "medha/plugin-sdk";
import { createDiagnosticsOtelService } from "./src/service.js";

const plugin = {
  id: "diagnostics-otel",
  name: "Diagnostics OpenTelemetry",
  description: "Export diagnostics events to OpenTelemetry",
  configSchema: emptyPluginConfigSchema(),
  register(api: MedhaPluginApi) {
    api.registerService(createDiagnosticsOtelService());
  },
};

export default plugin;
