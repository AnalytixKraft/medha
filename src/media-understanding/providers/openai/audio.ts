import path from "node:path";
import type { AudioTranscriptionRequest, AudioTranscriptionResult } from "../../types.js";
import { assertOkOrThrowHttpError, fetchWithTimeoutGuarded, normalizeBaseUrl } from "../shared.js";

export const DEFAULT_OPENAI_AUDIO_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_AUDIO_MODEL = "gpt-4o-mini-transcribe";

function resolveModel(model?: string): string {
  const trimmed = model?.trim();
  return trimmed || DEFAULT_OPENAI_AUDIO_MODEL;
}

function resolveLanguage(language?: string): string | undefined {
  const trimmed = language?.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.toLowerCase();
  if (normalized === "auto" || normalized === "automatic" || normalized === "detect") {
    return undefined;
  }
  return trimmed;
}

export async function transcribeOpenAiCompatibleAudio(
  params: AudioTranscriptionRequest,
): Promise<AudioTranscriptionResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const baseUrl = normalizeBaseUrl(params.baseUrl, DEFAULT_OPENAI_AUDIO_BASE_URL);
  const allowPrivate = Boolean(params.baseUrl?.trim());
  const url = `${baseUrl}/audio/transcriptions`;

  const model = resolveModel(params.model);
  const form = new FormData();
  const fileName = params.fileName?.trim() || path.basename(params.fileName) || "audio";
  const bytes = new Uint8Array(params.buffer);
  const blob = new Blob([bytes], {
    type: params.mime ?? "application/octet-stream",
  });
  form.append("file", blob, fileName);
  form.append("model", model);
  const language = resolveLanguage(params.language);
  if (language) {
    form.append("language", language);
  }
  if (params.prompt?.trim()) {
    form.append("prompt", params.prompt.trim());
  }

  const headers = new Headers(params.headers);
  if (!headers.has("authorization")) {
    headers.set("authorization", `Bearer ${params.apiKey}`);
  }

  const { response: res, release } = await fetchWithTimeoutGuarded(
    url,
    {
      method: "POST",
      headers,
      body: form,
    },
    params.timeoutMs,
    fetchFn,
    allowPrivate ? { ssrfPolicy: { allowPrivateNetwork: true } } : undefined,
  );

  try {
    await assertOkOrThrowHttpError(res, "Audio transcription failed");

    const payload = (await res.json()) as { text?: string };
    const text = payload.text?.trim();
    if (!text) {
      throw new Error("Audio transcription response missing text");
    }
    return { text, model };
  } finally {
    await release();
  }
}
