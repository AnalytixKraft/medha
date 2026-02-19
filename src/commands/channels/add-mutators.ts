import { getChannelPlugin } from "../../channels/plugins/index.js";
import type { ChannelId, ChannelSetupInput } from "../../channels/plugins/types.js";
import type { MedhaConfig } from "../../config/config.js";
import { normalizeAccountId } from "../../routing/session-key.js";

type ChatChannel = ChannelId;

export function applyAccountName(params: {
  cfg: MedhaConfig;
  channel: ChatChannel;
  accountId: string;
  name?: string;
}): MedhaConfig {
  const accountId = normalizeAccountId(params.accountId);
  const plugin = getChannelPlugin(params.channel);
  const apply = plugin?.setup?.applyAccountName;
  return apply ? apply({ cfg: params.cfg, accountId, name: params.name }) : params.cfg;
}

export function applyChannelAccountConfig(params: {
  cfg: MedhaConfig;
  channel: ChatChannel;
  accountId: string;
  input: ChannelSetupInput;
}): MedhaConfig {
  const accountId = normalizeAccountId(params.accountId);
  const plugin = getChannelPlugin(params.channel);
  const apply = plugin?.setup?.applyAccountConfig;
  if (!apply) {
    return params.cfg;
  }
  return apply({ cfg: params.cfg, accountId, input: params.input });
}
