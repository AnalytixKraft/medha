import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ReasoningLevel, ThinkLevel } from "../../auto-reply/thinking.js";

function normalizeProvider(provider?: string): string {
  return (provider ?? "").trim().toLowerCase();
}

function normalizeModelId(modelId?: string): string {
  return (modelId ?? "").trim().toLowerCase();
}

function isOpenAIReasoningModel(params: { provider?: string; modelId?: string }): boolean {
  const provider = normalizeProvider(params.provider);
  const modelId = normalizeModelId(params.modelId);
  if (!modelId.startsWith("gpt-5")) {
    return false;
  }
  return provider === "openai" || provider === "openai-codex" || provider === "github-copilot";
}

export function mapThinkingLevel(params: {
  level?: ThinkLevel;
  provider?: string;
  modelId?: string;
}): ThinkingLevel {
  // pi-agent-core supports "xhigh"; Medha enables it for specific models.
  const level = params.level;
  if (!level) {
    return "off";
  }
  // OpenAI GPT-5* reasoning expects "none|low|medium|high"; "minimal" 400s.
  if (level === "minimal" && isOpenAIReasoningModel(params)) {
    return "low";
  }
  return level;
}

export function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized ?? "Unknown error";
  } catch {
    return "Unknown error";
  }
}

export type { ReasoningLevel, ThinkLevel };
