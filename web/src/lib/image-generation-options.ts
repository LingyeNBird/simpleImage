export type ImageUpstreamEndpoint = "conversation" | "response";
export type ImageResponseCanvas = "auto" | "opaque" | "transparent";
export type ImageResponseResolution =
  | "auto"
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "2048x2048"
  | "2560x1440"
  | "1440x2560"
  | "3840x2160"
  | "2160x3840";
export type ImageResponseQuality = "auto" | "low" | "medium" | "high";
export type ImageResponseOutputFormat = "png" | "jpeg" | "webp";
export type ImageResponseModeration = "auto" | "low";
export type ImageResponseReasoningEffort = "low" | "medium" | "high";
export type ImageResponseReasoningSummary = "auto" | "concise" | "detailed";
export type ImageResponseToolChoice = "auto" | "required";

export const ACTIVE_CONVERSATION_STORAGE_KEY = "chatgpt2api:image_active_conversation_id";
export const IMAGE_SIZE_STORAGE_KEY = "chatgpt2api:image_last_size";
export const IMAGE_UPSTREAM_ENDPOINT_STORAGE_KEY = "chatgpt2api:image_upstream_endpoint";
export const IMAGE_RESPONSE_CANVAS_STORAGE_KEY = "chatgpt2api:image_response_canvas";
export const IMAGE_RESPONSE_RESOLUTION_STORAGE_KEY = "chatgpt2api:image_response_resolution";
export const IMAGE_RESPONSE_QUALITY_STORAGE_KEY = "chatgpt2api:image_response_quality";
export const IMAGE_RESPONSE_OUTPUT_FORMAT_STORAGE_KEY = "chatgpt2api:image_response_output_format";
export const IMAGE_RESPONSE_OUTPUT_COMPRESSION_STORAGE_KEY = "chatgpt2api:image_response_output_compression";
export const IMAGE_RESPONSE_MODERATION_STORAGE_KEY = "chatgpt2api:image_response_moderation";
export const IMAGE_RESPONSE_MAIN_MODEL_STORAGE_KEY = "chatgpt2api:image_response_main_model";
export const IMAGE_RESPONSE_TOOL_MODEL_STORAGE_KEY = "chatgpt2api:image_response_tool_model";
export const IMAGE_RESPONSE_INSTRUCTIONS_STORAGE_KEY = "chatgpt2api:image_response_instructions";
export const IMAGE_RESPONSE_REASONING_EFFORT_STORAGE_KEY = "chatgpt2api:image_response_reasoning_effort";
export const IMAGE_RESPONSE_REASONING_SUMMARY_STORAGE_KEY = "chatgpt2api:image_response_reasoning_summary";
export const IMAGE_RESPONSE_PARALLEL_TOOL_CALLS_STORAGE_KEY = "chatgpt2api:image_response_parallel_tool_calls";
export const IMAGE_RESPONSE_INCLUDE_ENCRYPTED_REASONING_STORAGE_KEY = "chatgpt2api:image_response_include_encrypted_reasoning";
export const IMAGE_RESPONSE_STORE_STORAGE_KEY = "chatgpt2api:image_response_store";
export const IMAGE_RESPONSE_PARTIAL_IMAGES_STORAGE_KEY = "chatgpt2api:image_response_partial_images";
export const IMAGE_RESPONSE_TOOL_CHOICE_STORAGE_KEY = "chatgpt2api:image_response_tool_choice";

export const DEFAULT_IMAGE_UPSTREAM_ENDPOINT: ImageUpstreamEndpoint = "conversation";
export const DEFAULT_IMAGE_SIZE = "1:1";
export const DEFAULT_IMAGE_RESPONSE_CANVAS: ImageResponseCanvas = "auto";
export const DEFAULT_IMAGE_RESPONSE_RESOLUTION: ImageResponseResolution = "auto";
export const DEFAULT_IMAGE_RESPONSE_QUALITY: ImageResponseQuality = "auto";
export const DEFAULT_IMAGE_RESPONSE_OUTPUT_FORMAT: ImageResponseOutputFormat = "png";
export const DEFAULT_IMAGE_RESPONSE_OUTPUT_COMPRESSION = "auto";
export const DEFAULT_IMAGE_RESPONSE_MODERATION: ImageResponseModeration = "auto";
export const DEFAULT_IMAGE_RESPONSE_MAIN_MODEL = "gpt-5.4-mini";
export const DEFAULT_IMAGE_RESPONSE_TOOL_MODEL = "auto";
export const DEFAULT_IMAGE_RESPONSE_INSTRUCTIONS = "";
export const DEFAULT_IMAGE_RESPONSE_REASONING_EFFORT: ImageResponseReasoningEffort = "medium";
export const DEFAULT_IMAGE_RESPONSE_REASONING_SUMMARY: ImageResponseReasoningSummary = "auto";
export const DEFAULT_IMAGE_RESPONSE_PARALLEL_TOOL_CALLS = true;
export const DEFAULT_IMAGE_RESPONSE_INCLUDE_ENCRYPTED_REASONING = true;
export const DEFAULT_IMAGE_RESPONSE_STORE = false;
export const DEFAULT_IMAGE_RESPONSE_PARTIAL_IMAGES = "0";
export const DEFAULT_IMAGE_RESPONSE_TOOL_CHOICE: ImageResponseToolChoice = "required";

export const IMAGE_SIZE_OPTIONS = ["1:1", "16:9", "4:3", "3:4", "9:16"] as const;
export const IMAGE_SIZE_LABELS: Record<string, string> = {
  "1:1": "1:1（正方形）",
  "16:9": "16:9（横版）",
  "4:3": "4:3（横版）",
  "3:4": "3:4（竖版）",
  "9:16": "9:16（竖版）",
};

export const IMAGE_UPSTREAM_ENDPOINT_OPTIONS: Array<{ value: ImageUpstreamEndpoint; label: string; description: string }> = [
  { value: "conversation", label: "/conversation", description: "兼容当前 ChatGPT 对话型生图链路，支持比例设置" },
  { value: "response", label: "/response", description: "使用 Responses 风格上游，请求更直接，支持画布/分辨率/质量" },
];

export const IMAGE_RESPONSE_CANVAS_OPTIONS: Array<{ value: ImageResponseCanvas; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "opaque", label: "不透明画布" },
  { value: "transparent", label: "透明画布" },
];

export const IMAGE_RESPONSE_RESOLUTION_VALUES: ImageResponseResolution[] = [
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x2048",
  "2560x1440",
  "1440x2560",
  "3840x2160",
  "2160x3840",
];

export const IMAGE_RESPONSE_RESOLUTION_OPTIONS: Array<{ value: ImageResponseResolution; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "1024x1024", label: "1024 × 1024" },
  { value: "1536x1024", label: "1536 × 1024" },
  { value: "1024x1536", label: "1024 × 1536" },
  { value: "2048x2048", label: "2048 × 2048" },
  { value: "2560x1440", label: "2560 × 1440" },
  { value: "1440x2560", label: "1440 × 2560" },
  { value: "3840x2160", label: "3840 × 2160" },
  { value: "2160x3840", label: "2160 × 3840" },
];

export function isImageResponseResolution(value: string): value is ImageResponseResolution {
  return IMAGE_RESPONSE_RESOLUTION_VALUES.includes(value as ImageResponseResolution);
}

export const IMAGE_RESPONSE_QUALITY_OPTIONS: Array<{ value: ImageResponseQuality; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

export const IMAGE_RESPONSE_OUTPUT_FORMAT_OPTIONS: Array<{ value: ImageResponseOutputFormat; label: string }> = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WEBP" },
];

export const IMAGE_RESPONSE_MODERATION_OPTIONS: Array<{ value: ImageResponseModeration; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "low", label: "低限制" },
];

export const IMAGE_RESPONSE_REASONING_EFFORT_OPTIONS: Array<{ value: ImageResponseReasoningEffort; label: string }> = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

export const IMAGE_RESPONSE_REASONING_SUMMARY_OPTIONS: Array<{ value: ImageResponseReasoningSummary; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "concise", label: "简洁" },
  { value: "detailed", label: "详细" },
];

export const IMAGE_RESPONSE_TOOL_CHOICE_OPTIONS: Array<{ value: ImageResponseToolChoice; label: string }> = [
  { value: "required", label: "强制调图" },
  { value: "auto", label: "自动选择" },
];

export function isImageResponseOutputFormat(value: string): value is ImageResponseOutputFormat {
  return value === "png" || value === "jpeg" || value === "webp";
}

export function isImageResponseModeration(value: string): value is ImageResponseModeration {
  return value === "auto" || value === "low";
}

export function isImageResponseReasoningEffort(value: string): value is ImageResponseReasoningEffort {
  return value === "low" || value === "medium" || value === "high";
}

export function isImageResponseReasoningSummary(value: string): value is ImageResponseReasoningSummary {
  return value === "auto" || value === "concise" || value === "detailed";
}

export function isImageResponseToolChoice(value: string): value is ImageResponseToolChoice {
  return value === "auto" || value === "required";
}

export function normalizeImageResponseOutputCompression(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "auto") {
    return DEFAULT_IMAGE_RESPONSE_OUTPUT_COMPRESSION;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_IMAGE_RESPONSE_OUTPUT_COMPRESSION;
  }

  const clamped = Math.min(100, Math.max(0, Math.round(parsed)));
  return String(clamped);
}

export function normalizeImageResponsePartialImages(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "auto") {
    return DEFAULT_IMAGE_RESPONSE_PARTIAL_IMAGES;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_IMAGE_RESPONSE_PARTIAL_IMAGES;
  }

  return String(Math.max(0, Math.round(parsed)));
}

export function parseImageResponseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}
