export type ImageUpstreamEndpoint = "conversation" | "response";
export type ImageResponseCanvas = "auto" | "opaque" | "transparent";
export type ImageResponseResolution = "auto" | "1024x1024" | "1536x1024" | "1024x1536";
export type ImageResponseQuality = "auto" | "low" | "medium" | "high";

export const ACTIVE_CONVERSATION_STORAGE_KEY = "chatgpt2api:image_active_conversation_id";
export const IMAGE_SIZE_STORAGE_KEY = "chatgpt2api:image_last_size";
export const IMAGE_UPSTREAM_ENDPOINT_STORAGE_KEY = "chatgpt2api:image_upstream_endpoint";
export const IMAGE_RESPONSE_CANVAS_STORAGE_KEY = "chatgpt2api:image_response_canvas";
export const IMAGE_RESPONSE_RESOLUTION_STORAGE_KEY = "chatgpt2api:image_response_resolution";
export const IMAGE_RESPONSE_QUALITY_STORAGE_KEY = "chatgpt2api:image_response_quality";

export const DEFAULT_IMAGE_UPSTREAM_ENDPOINT: ImageUpstreamEndpoint = "conversation";
export const DEFAULT_IMAGE_SIZE = "1:1";
export const DEFAULT_IMAGE_RESPONSE_CANVAS: ImageResponseCanvas = "auto";
export const DEFAULT_IMAGE_RESPONSE_RESOLUTION: ImageResponseResolution = "auto";
export const DEFAULT_IMAGE_RESPONSE_QUALITY: ImageResponseQuality = "auto";

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

export const IMAGE_RESPONSE_RESOLUTION_OPTIONS: Array<{ value: ImageResponseResolution; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "1024x1024", label: "1024 × 1024" },
  { value: "1536x1024", label: "1536 × 1024" },
  { value: "1024x1536", label: "1024 × 1536" },
];

export const IMAGE_RESPONSE_QUALITY_OPTIONS: Array<{ value: ImageResponseQuality; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];
