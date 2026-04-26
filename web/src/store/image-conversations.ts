"use client";

import localforage from "localforage";

import type {
  ImageResponseCanvas,
  ImageResponseModeration,
  ImageResponseOutputFormat,
  ImageResponseQuality,
  ImageResponseReasoningEffort,
  ImageResponseReasoningSummary,
  ImageResponseResolution,
  ImageResponseToolChoice,
  ImageUpstreamEndpoint,
} from "@/lib/image-generation-options";
import {
  DEFAULT_IMAGE_RESPONSE_INCLUDE_ENCRYPTED_REASONING,
  DEFAULT_IMAGE_RESPONSE_MAIN_MODEL,
  DEFAULT_IMAGE_RESPONSE_OUTPUT_COMPRESSION,
  DEFAULT_IMAGE_RESPONSE_PARALLEL_TOOL_CALLS,
  DEFAULT_IMAGE_RESPONSE_PARTIAL_IMAGES,
  DEFAULT_IMAGE_RESPONSE_REASONING_EFFORT,
  DEFAULT_IMAGE_RESPONSE_REASONING_SUMMARY,
  DEFAULT_IMAGE_RESPONSE_STORE,
  DEFAULT_IMAGE_RESPONSE_TOOL_CHOICE,
  DEFAULT_IMAGE_RESPONSE_TOOL_MODEL,
  isImageResponseReasoningEffort,
  isImageResponseReasoningSummary,
  isImageResponseModeration,
  isImageResponseOutputFormat,
  isImageResponseResolution,
  isImageResponseToolChoice,
  normalizeImageResponseOutputCompression,
  normalizeImageResponsePartialImages,
} from "@/lib/image-generation-options";
import type { ImageDeliveryMode, ImageModel } from "@/lib/api";

export type ImageConversationMode = "generate" | "edit";

export type StoredReferenceImage = {
  name: string;
  type: string;
  dataUrl: string;
};

export type StoredImage = {
  id: string;
  status?: "loading" | "success" | "error";
  b64_json?: string;
  url?: string;
  urlExpiresAt?: string;
  storage?: "direct" | "image_bed";
  error?: string;
  failureLog?: string;
};

export type ImageTurnStatus = "queued" | "generating" | "success" | "error";

export type ImageTurn = {
  id: string;
  backendJobId?: string;
  prompt: string;
  model: ImageModel;
  mode: ImageConversationMode;
  deliveryMode: ImageDeliveryMode;
   upstreamEndpoint: ImageUpstreamEndpoint;
   responseCanvas: ImageResponseCanvas;
   responseResolution: ImageResponseResolution;
   responseQuality: ImageResponseQuality;
   responseOutputFormat: ImageResponseOutputFormat;
   responseOutputCompression: string;
   responseModeration: ImageResponseModeration;
   responseMainModel: string;
   responseToolModel: string;
   responseInstructions: string;
   responseReasoningEffort: ImageResponseReasoningEffort;
   responseReasoningSummary: ImageResponseReasoningSummary;
   responseParallelToolCalls: boolean;
   responseIncludeEncryptedReasoning: boolean;
   responseStore: boolean;
   responsePartialImages: string;
   responseToolChoice: ImageResponseToolChoice;
   referenceImages: StoredReferenceImage[];
  count: number;
  size: string;
  images: StoredImage[];
  createdAt: string;
  status: ImageTurnStatus;
  error?: string;
  failureLog?: string;
};

export type ImageConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: ImageTurn[];
};

export type ImageConversationStats = {
  queued: number;
  running: number;
};

const imageConversationStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "image_conversations",
});

const IMAGE_CONVERSATIONS_KEY = "items";
let imageConversationWriteQueue: Promise<void> = Promise.resolve();

function normalizeStoredImage(image: StoredImage): StoredImage {
  if (image.status === "loading" || image.status === "error" || image.status === "success") {
    return image;
  }
  return {
    ...image,
    status: image.b64_json || image.url ? "success" : "loading",
  };
}

function normalizeReferenceImage(image: StoredReferenceImage): StoredReferenceImage {
  return {
    name: image.name || "reference.png",
    type: image.type || "image/png",
    dataUrl: image.dataUrl,
  };
}

function dataUrlMimeType(dataUrl: string) {
  const match = dataUrl.match(/^data:(.*?);base64,/);
  return match?.[1] || "image/png";
}

function getLegacyReferenceImages(source: Record<string, unknown>): StoredReferenceImage[] {
  if (Array.isArray(source.referenceImages)) {
    return source.referenceImages
      .filter((image): image is StoredReferenceImage => {
        if (!image || typeof image !== "object") {
          return false;
        }
        const candidate = image as StoredReferenceImage;
        return typeof candidate.dataUrl === "string" && candidate.dataUrl.length > 0;
      })
      .map(normalizeReferenceImage);
  }

  if (source.sourceImage && typeof source.sourceImage === "object") {
    const image = source.sourceImage as { dataUrl?: unknown; fileName?: unknown };
    if (typeof image.dataUrl === "string" && image.dataUrl) {
      return [
        {
          name: typeof image.fileName === "string" && image.fileName ? image.fileName : "reference.png",
          type: dataUrlMimeType(image.dataUrl),
          dataUrl: image.dataUrl,
        },
      ];
    }
  }

  return [];
}

function normalizeTurn(turn: ImageTurn & Record<string, unknown>): ImageTurn {
  const normalizedImages = Array.isArray(turn.images) ? turn.images.map(normalizeStoredImage) : [];
  const derivedStatus: ImageTurnStatus =
    normalizedImages.some((image) => image.status === "loading")
      ? "generating"
      : normalizedImages.some((image) => image.status === "error")
        ? "error"
        : "success";

  return {
    id: String(turn.id || `${Date.now()}`),
    backendJobId: typeof turn.backendJobId === "string" && turn.backendJobId ? turn.backendJobId : undefined,
    prompt: String(turn.prompt || ""),
    model: (turn.model as ImageModel) || "auto",
    mode: turn.mode === "edit" ? "edit" : "generate",
    deliveryMode: turn.deliveryMode === "image_bed" ? "image_bed" : "direct",
    upstreamEndpoint: turn.upstreamEndpoint === "response" ? "response" : "conversation",
    responseCanvas: turn.responseCanvas === "opaque" || turn.responseCanvas === "transparent" ? turn.responseCanvas : "auto",
    responseResolution: typeof turn.responseResolution === "string" && isImageResponseResolution(turn.responseResolution) ? turn.responseResolution : "auto",
    responseQuality:
      turn.responseQuality === "low" || turn.responseQuality === "medium" || turn.responseQuality === "high"
        ? turn.responseQuality
        : "auto",
    responseOutputFormat:
      typeof turn.responseOutputFormat === "string" && isImageResponseOutputFormat(turn.responseOutputFormat)
        ? turn.responseOutputFormat
        : "png",
    responseOutputCompression: normalizeImageResponseOutputCompression(String(turn.responseOutputCompression || DEFAULT_IMAGE_RESPONSE_OUTPUT_COMPRESSION)),
    responseModeration:
      typeof turn.responseModeration === "string" && isImageResponseModeration(turn.responseModeration) ? turn.responseModeration : "auto",
    responseMainModel: typeof turn.responseMainModel === "string" && turn.responseMainModel.trim() ? turn.responseMainModel.trim() : DEFAULT_IMAGE_RESPONSE_MAIN_MODEL,
    responseToolModel: typeof turn.responseToolModel === "string" && turn.responseToolModel.trim() ? turn.responseToolModel.trim() : DEFAULT_IMAGE_RESPONSE_TOOL_MODEL,
    responseInstructions: typeof turn.responseInstructions === "string" ? turn.responseInstructions : "",
    responseReasoningEffort:
      typeof turn.responseReasoningEffort === "string" && isImageResponseReasoningEffort(turn.responseReasoningEffort)
        ? turn.responseReasoningEffort
        : DEFAULT_IMAGE_RESPONSE_REASONING_EFFORT,
    responseReasoningSummary:
      typeof turn.responseReasoningSummary === "string" && isImageResponseReasoningSummary(turn.responseReasoningSummary)
        ? turn.responseReasoningSummary
        : DEFAULT_IMAGE_RESPONSE_REASONING_SUMMARY,
    responseParallelToolCalls:
      typeof turn.responseParallelToolCalls === "boolean" ? turn.responseParallelToolCalls : DEFAULT_IMAGE_RESPONSE_PARALLEL_TOOL_CALLS,
    responseIncludeEncryptedReasoning:
      typeof turn.responseIncludeEncryptedReasoning === "boolean"
        ? turn.responseIncludeEncryptedReasoning
        : DEFAULT_IMAGE_RESPONSE_INCLUDE_ENCRYPTED_REASONING,
    responseStore: typeof turn.responseStore === "boolean" ? turn.responseStore : DEFAULT_IMAGE_RESPONSE_STORE,
    responsePartialImages: normalizeImageResponsePartialImages(String(turn.responsePartialImages || DEFAULT_IMAGE_RESPONSE_PARTIAL_IMAGES)),
    responseToolChoice:
      typeof turn.responseToolChoice === "string" && isImageResponseToolChoice(turn.responseToolChoice)
        ? turn.responseToolChoice
        : DEFAULT_IMAGE_RESPONSE_TOOL_CHOICE,
    referenceImages: getLegacyReferenceImages(turn),
    count: Math.max(1, Number(turn.count || normalizedImages.length || 1)),
    size: String(turn.size || "1:1"),
    images: normalizedImages,
    createdAt: String(turn.createdAt || new Date().toISOString()),
    status:
      turn.status === "queued" ||
      turn.status === "generating" ||
      turn.status === "success" ||
      turn.status === "error"
        ? turn.status
        : derivedStatus,
    error: typeof turn.error === "string" ? turn.error : undefined,
    failureLog: typeof turn.failureLog === "string" ? turn.failureLog : undefined,
  };
}

function normalizeConversation(conversation: ImageConversation & Record<string, unknown>): ImageConversation {
  const turns = Array.isArray(conversation.turns)
    ? conversation.turns.map((turn) => normalizeTurn(turn as ImageTurn & Record<string, unknown>))
    : [
        normalizeTurn({
          id: String(conversation.id || `${Date.now()}`),
          prompt: String(conversation.prompt || ""),
          model: (conversation.model as ImageModel) || "auto",
          mode: conversation.mode === "edit" ? "edit" : "generate",
          deliveryMode: conversation.deliveryMode === "image_bed" ? "image_bed" : "direct",
          upstreamEndpoint: conversation.upstreamEndpoint === "response" ? "response" : "conversation",
          responseCanvas:
            conversation.responseCanvas === "opaque" || conversation.responseCanvas === "transparent"
              ? conversation.responseCanvas
              : "auto",
          responseResolution:
            typeof conversation.responseResolution === "string" && isImageResponseResolution(conversation.responseResolution)
              ? conversation.responseResolution
              : "auto",
          responseQuality:
            conversation.responseQuality === "low" ||
            conversation.responseQuality === "medium" ||
            conversation.responseQuality === "high"
              ? conversation.responseQuality
              : "auto",
          responseOutputFormat:
            typeof conversation.responseOutputFormat === "string" && isImageResponseOutputFormat(conversation.responseOutputFormat)
              ? conversation.responseOutputFormat
              : "png",
          responseOutputCompression: normalizeImageResponseOutputCompression(
            String(conversation.responseOutputCompression || DEFAULT_IMAGE_RESPONSE_OUTPUT_COMPRESSION),
          ),
          responseModeration:
            typeof conversation.responseModeration === "string" && isImageResponseModeration(conversation.responseModeration)
              ? conversation.responseModeration
              : "auto",
          responseMainModel:
            typeof conversation.responseMainModel === "string" && conversation.responseMainModel.trim()
              ? conversation.responseMainModel.trim()
              : DEFAULT_IMAGE_RESPONSE_MAIN_MODEL,
          responseToolModel:
            typeof conversation.responseToolModel === "string" && conversation.responseToolModel.trim()
              ? conversation.responseToolModel.trim()
              : DEFAULT_IMAGE_RESPONSE_TOOL_MODEL,
          responseInstructions: typeof conversation.responseInstructions === "string" ? conversation.responseInstructions : "",
          responseReasoningEffort:
            typeof conversation.responseReasoningEffort === "string" && isImageResponseReasoningEffort(conversation.responseReasoningEffort)
              ? conversation.responseReasoningEffort
              : DEFAULT_IMAGE_RESPONSE_REASONING_EFFORT,
          responseReasoningSummary:
            typeof conversation.responseReasoningSummary === "string" && isImageResponseReasoningSummary(conversation.responseReasoningSummary)
              ? conversation.responseReasoningSummary
              : DEFAULT_IMAGE_RESPONSE_REASONING_SUMMARY,
          responseParallelToolCalls:
            typeof conversation.responseParallelToolCalls === "boolean"
              ? conversation.responseParallelToolCalls
              : DEFAULT_IMAGE_RESPONSE_PARALLEL_TOOL_CALLS,
          responseIncludeEncryptedReasoning:
            typeof conversation.responseIncludeEncryptedReasoning === "boolean"
              ? conversation.responseIncludeEncryptedReasoning
              : DEFAULT_IMAGE_RESPONSE_INCLUDE_ENCRYPTED_REASONING,
          responseStore: typeof conversation.responseStore === "boolean" ? conversation.responseStore : DEFAULT_IMAGE_RESPONSE_STORE,
          responsePartialImages: normalizeImageResponsePartialImages(
            String(conversation.responsePartialImages || DEFAULT_IMAGE_RESPONSE_PARTIAL_IMAGES),
          ),
          responseToolChoice:
            typeof conversation.responseToolChoice === "string" && isImageResponseToolChoice(conversation.responseToolChoice)
              ? conversation.responseToolChoice
              : DEFAULT_IMAGE_RESPONSE_TOOL_CHOICE,
          referenceImages: getLegacyReferenceImages(conversation),
          count: Number(conversation.count || 1),
          size: String(conversation.size || "1:1"),
          images: Array.isArray(conversation.images) ? (conversation.images as StoredImage[]) : [],
          createdAt: String(conversation.createdAt || new Date().toISOString()),
          status:
            conversation.status === "generating" || conversation.status === "success" || conversation.status === "error"
              ? conversation.status
              : "success",
           error: typeof conversation.error === "string" ? conversation.error : undefined,
           failureLog: typeof conversation.failureLog === "string" ? conversation.failureLog : undefined,
         }),
      ];
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  return {
    id: String(conversation.id || `${Date.now()}`),
    title: String(conversation.title || ""),
    createdAt: String(conversation.createdAt || lastTurn?.createdAt || new Date().toISOString()),
    updatedAt: String(conversation.updatedAt || lastTurn?.createdAt || new Date().toISOString()),
    turns,
  };
}

function sortImageConversations(conversations: ImageConversation[]): ImageConversation[] {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function queueImageConversationWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = imageConversationWriteQueue.then(operation);
  imageConversationWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readStoredImageConversations(): Promise<ImageConversation[]> {
  const items =
    (await imageConversationStorage.getItem<Array<ImageConversation & Record<string, unknown>>>(IMAGE_CONVERSATIONS_KEY)) ||
    [];
  return items.map(normalizeConversation);
}

export async function listImageConversations(): Promise<ImageConversation[]> {
  return sortImageConversations(await readStoredImageConversations());
}

export async function saveImageConversations(conversations: ImageConversation[]): Promise<void> {
  await queueImageConversationWrite(async () => {
    const normalizedItems = sortImageConversations(conversations.map(normalizeConversation));
    await imageConversationStorage.setItem(IMAGE_CONVERSATIONS_KEY, normalizedItems);
  });
}

export async function saveImageConversation(conversation: ImageConversation): Promise<void> {
  await queueImageConversationWrite(async () => {
    const items = await readStoredImageConversations();
    const nextItems = sortImageConversations([
      normalizeConversation(conversation),
      ...items.filter((item) => item.id !== conversation.id),
    ]);
    await imageConversationStorage.setItem(IMAGE_CONVERSATIONS_KEY, nextItems);
  });
}

export async function deleteImageConversation(id: string): Promise<void> {
  await queueImageConversationWrite(async () => {
    const items = await readStoredImageConversations();
    await imageConversationStorage.setItem(
      IMAGE_CONVERSATIONS_KEY,
      items.filter((item) => item.id !== id),
    );
  });
}

export async function clearImageConversations(): Promise<void> {
  await queueImageConversationWrite(async () => {
    await imageConversationStorage.removeItem(IMAGE_CONVERSATIONS_KEY);
  });
}

export function getImageConversationStats(conversation: ImageConversation | null): ImageConversationStats {
  if (!conversation) {
    return { queued: 0, running: 0 };
  }

  return conversation.turns.reduce(
    (acc, turn) => {
      if (turn.status === "queued") {
        acc.queued += 1;
      } else if (turn.status === "generating") {
        acc.running += 1;
      }
      return acc;
    },
    { queued: 0, running: 0 },
  );
}
