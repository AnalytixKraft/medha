import type {
  AnyAgentTool,
  MedhaPluginApi,
  MedhaPluginToolFactory,
} from "../../src/plugins/types.js";
import { createLobsterTool } from "./src/lobster-tool.js";

export default function register(api: MedhaPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createLobsterTool(api) as AnyAgentTool;
    }) as MedhaPluginToolFactory,
    { optional: true },
  );
}
