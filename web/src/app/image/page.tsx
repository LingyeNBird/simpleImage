"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { toast } from "sonner";

import { ImageComposer } from "@/app/image/components/image-composer";
import { ImageResults, type ImageLightboxItem } from "@/app/image/components/image-results";
import { ImageSidebar } from "@/app/image/components/image-sidebar";
import { ImageLightbox } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  createImageJob,
  editImage,
  fetchCurrentIdentity,
  fetchImageJobs,
  generateImage,
  redeemUserQuota,
  type CurrentIdentity,
  type ImageDeliveryMode,
  type ImageJob,
} from "@/lib/api";
import {
  clearImageConversations,
  deleteImageConversation,
  getImageConversationStats,
  listImageConversations,
  saveImageConversations,
  type ImageConversation,
  type ImageConversationMode,
  type ImageTurn,
  type ImageTurnStatus,
  type StoredImage,
  type StoredReferenceImage,
} from "@/store/image-conversations";
import { getStoredAuthSession } from "@/store/auth";

const ACTIVE_CONVERSATION_STORAGE_KEY = "chatgpt2api:image_active_conversation_id";
const activeConversationQueueIds = new Set<string>();

function buildConversationTitle(prompt: string) {
  const trimmed = prompt.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 12)}...`;
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resolveAvailableQuota(identity: CurrentIdentity | null) {
  if (!identity) {
    return "0";
  }

  if (identity.role === "admin") {
    return "∞";
  }

  const quotaCandidate =
    typeof identity.quota === "number"
      ? identity.quota
      : typeof (identity as { remaining_quota?: number }).remaining_quota === "number"
        ? Number((identity as { remaining_quota?: number }).remaining_quota)
        : 0;

  return String(Math.max(0, Number(quotaCandidate) || 0));
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取参考图失败"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl: string, fileName: string, mimeType?: string) {
  const [header, content] = dataUrl.split(",", 2);
  const matchedMimeType = header.match(/data:(.*?);base64/)?.[1];
  const binary = atob(content || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mimeType || matchedMimeType || "image/png" });
}

function buildReferenceImageFromResult(image: StoredImage, fileName: string): StoredReferenceImage | null {
  if (!image.b64_json) {
    return null;
  }

  return {
    name: fileName,
    type: "image/png",
    dataUrl: `data:image/png;base64,${image.b64_json}`,
  };
}

async function fetchImageUrlAsDataUrl(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("读取图床图片失败");
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图床图片失败"));
    reader.readAsDataURL(blob);
  });
}

function pickFallbackConversationId(conversations: ImageConversation[]) {
  const activeConversation = conversations.find((conversation) =>
    conversation.turns.some((turn) => turn.status === "queued" || turn.status === "generating"),
  );
  return activeConversation?.id ?? conversations[0]?.id ?? null;
}

function mapJobStatusToTurnStatus(status: ImageJob["status"]): ImageTurnStatus {
  if (status === "queued") {
    return "queued";
  }
  if (status === "running") {
    return "generating";
  }
  if (status === "success") {
    return "success";
  }
  return "error";
}

function buildConversationFromImageJob(job: ImageJob): ImageConversation {
  const turnId = `job-${job.id}`;
  return {
    id: job.conversation_id || `job-conversation-${job.id}`,
    title: job.conversation_title || buildConversationTitle(job.prompt),
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    turns: [
      {
        id: turnId,
        backendJobId: job.id,
        prompt: job.prompt,
        model: job.model,
        mode: job.mode,
        deliveryMode: "image_bed",
        referenceImages: [],
        count: job.count,
        images:
          job.status === "success"
            ? job.result_images.map((image) => ({
                id: image.id,
                status: "success" as const,
                url: image.url,
                urlExpiresAt: image.url_expires_at,
                storage: "image_bed" as const,
              }))
            : Array.from({ length: job.count }, (_, index) => ({
                id: `${turnId}-${index}`,
                status: job.status === "error" ? ("error" as const) : ("loading" as const),
                error: job.status === "error" ? job.error || "生成失败" : undefined,
              })),
        createdAt: job.created_at,
        status: mapJobStatusToTurnStatus(job.status),
        error: job.status === "error" ? job.error || undefined : undefined,
      },
    ],
  };
}

function mergeImageJobConversations(current: ImageConversation[], jobs: ImageJob[]) {
  const groupedConversations = new Map<string, ImageConversation>();
  for (const job of jobs) {
    const nextConversation = buildConversationFromImageJob(job);
    const existingConversation = groupedConversations.get(nextConversation.id);
    if (!existingConversation) {
      groupedConversations.set(nextConversation.id, nextConversation);
      continue;
    }
    existingConversation.turns.push(...nextConversation.turns);
    existingConversation.updatedAt = nextConversation.updatedAt > existingConversation.updatedAt ? nextConversation.updatedAt : existingConversation.updatedAt;
  }
  const remoteConversations = Array.from(groupedConversations.values()).map((conversation) => ({
    ...conversation,
    turns: [...conversation.turns].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));
  const currentMap = new Map(current.map((conversation) => [conversation.id, conversation]));
  const mergedRemoteConversations = remoteConversations.map((remoteConversation) => {
    const localConversation = currentMap.get(remoteConversation.id);
    if (!localConversation) {
      return remoteConversation;
    }
    const localNonBackendTurns = localConversation.turns.filter((turn) => !turn.backendJobId);
    return {
      ...remoteConversation,
      title: localConversation.title || remoteConversation.title,
      createdAt: localConversation.createdAt < remoteConversation.createdAt ? localConversation.createdAt : remoteConversation.createdAt,
      turns: [...localNonBackendTurns, ...remoteConversation.turns].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  });
  const remoteIds = new Set(mergedRemoteConversations.map((conversation) => conversation.id));
  const untouchedLocalConversations = current.filter((conversation) => !remoteIds.has(conversation.id));
  return sortImageConversations([...untouchedLocalConversations, ...mergedRemoteConversations]);
}

function sortImageConversations(conversations: ImageConversation[]) {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function recoverConversationHistory(items: ImageConversation[]) {
  const normalized = items.map((conversation) => {
    let changed = false;

    const turns = conversation.turns.map((turn) => {
      if (turn.status !== "queued" && turn.status !== "generating") {
        return turn;
      }

      const loadingCount = turn.images.filter((image) => image.status === "loading").length;
      if (loadingCount > 0) {
        const message = "页面刷新或任务中断，未完成的图片已标记为失败";
        changed = true;
        return {
          ...turn,
          status: "error" as const,
          error: message,
          images: turn.images.map((image) =>
            image.status === "loading" ? { ...image, status: "error" as const, error: message } : image,
          ),
        };
      }

      const failedCount = turn.images.filter((image) => image.status === "error").length;
      const successCount = turn.images.filter((image) => image.status === "success").length;
      const nextStatus: ImageTurnStatus =
        failedCount > 0 ? "error" : successCount > 0 ? "success" : "queued";
      const nextError = failedCount > 0 ? turn.error || `其中 ${failedCount} 张未成功生成` : undefined;
      if (nextStatus === turn.status && nextError === turn.error) {
        return turn;
      }

      changed = true;
      return {
        ...turn,
        status: nextStatus,
        error: nextError,
      };
    });

    if (!changed) {
      return conversation;
    }

    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
    return {
      ...conversation,
      turns,
      updatedAt: lastTurn?.createdAt || conversation.updatedAt,
    };
  });

  const changedConversations = normalized.filter((conversation, index) => conversation !== items[index]);
  if (changedConversations.length > 0) {
    await saveImageConversations(normalized);
  }

  return normalized;
}

export default function ImagePage() {
  const router = useRouter();
  const didLoadQuotaRef = useRef(false);
  const conversationsRef = useRef<ImageConversation[]>([]);
  const resultsViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [guardReady, setGuardReady] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageCount, setImageCount] = useState("1");
  const [imageMode, setImageMode] = useState<ImageConversationMode>("generate");
  const [referenceImageFiles, setReferenceImageFiles] = useState<File[]>([]);
  const [referenceImages, setReferenceImages] = useState<StoredReferenceImage[]>([]);
  const [conversations, setConversations] = useState<ImageConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [availableQuota, setAvailableQuota] = useState("0");
  const [currentIdentity, setCurrentIdentity] = useState<CurrentIdentity | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<ImageDeliveryMode>("direct");
  const [redeemText, setRedeemText] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<ImageLightboxItem[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const parsedCount = useMemo(() => Math.max(1, Math.min(10, Number(imageCount) || 1)), [imageCount]);
  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );
  const activeTaskCount = useMemo(
    () =>
      conversations.reduce((sum, conversation) => {
        const stats = getImageConversationStats(conversation);
        return sum + stats.queued + stats.running;
      }, 0),
    [conversations],
  );
  const hasPendingBackendJobs = useMemo(
    () =>
      conversations.some((conversation) =>
        conversation.turns.some(
          (turn) => Boolean(turn.backendJobId) && (turn.status === "queued" || turn.status === "generating"),
        ),
      ),
    [conversations],
  );
  const availableDeliveryModes = useMemo<ImageDeliveryMode[]>(() => {
    const modes = currentIdentity?.image_delivery_modes;
    return modes && modes.length > 0 ? modes : ["direct"];
  }, [currentIdentity]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    let cancelled = false;

    const ensureSignedIn = async () => {
      const session = await getStoredAuthSession();
      if (cancelled) {
        return;
      }

      if (!session) {
        router.replace("/login");
        return;
      }

      setGuardReady(true);
    };

    void ensureSignedIn();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const syncImageJobs = useCallback(async () => {
    try {
      const data = await fetchImageJobs();
      const nextConversations = mergeImageJobConversations(conversationsRef.current, data.items);
      conversationsRef.current = nextConversations;
      setConversations(nextConversations);
      await saveImageConversations(nextConversations);
    } catch {
      // ignore polling failures to keep local history usable
    }
  }, []);

  useEffect(() => {
    if (!guardReady) {
      return;
    }

    let cancelled = false;

    const loadHistory = async () => {
      try {
        const items = await listImageConversations();
        const normalizedItems = await recoverConversationHistory(items);
        if (cancelled) {
          return;
        }

        conversationsRef.current = normalizedItems;
        setConversations(normalizedItems);
        const storedConversationId =
          typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY) : null;
        const nextSelectedConversationId =
          (storedConversationId && normalizedItems.some((conversation) => conversation.id === storedConversationId)
            ? storedConversationId
            : null) ?? pickFallbackConversationId(normalizedItems);
        setSelectedConversationId(nextSelectedConversationId);
        await syncImageJobs();
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取会话记录失败";
        toast.error(message);
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [guardReady, syncImageJobs]);

  const loadQuota = useCallback(async () => {
    try {
      const identity = await fetchCurrentIdentity();
      setCurrentIdentity(identity);
      setAvailableQuota(resolveAvailableQuota(identity));
    } catch {
      setAvailableQuota((prev) => (prev === "0" ? "0" : prev));
    }
  }, []);

  useEffect(() => {
    if (availableDeliveryModes.includes(deliveryMode)) {
      return;
    }
    setDeliveryMode(availableDeliveryModes[0] || "direct");
  }, [availableDeliveryModes, deliveryMode]);

  useEffect(() => {
    if (!guardReady) {
      return;
    }
    if (!hasPendingBackendJobs) {
      return;
    }

    const timer = window.setInterval(() => {
      void syncImageJobs();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [guardReady, hasPendingBackendJobs, syncImageJobs]);

  useEffect(() => {
    if (!guardReady) {
      return;
    }

    if (didLoadQuotaRef.current) {
      return;
    }
    didLoadQuotaRef.current = true;

    const handleFocus = () => {
      void loadQuota();
    };

    void loadQuota();
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [guardReady, loadQuota]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (selectedConversationId) {
      window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, selectedConversationId);
    } else {
      window.localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    if (selectedConversationId && !conversations.some((conversation) => conversation.id === selectedConversationId)) {
      setSelectedConversationId(pickFallbackConversationId(conversations));
    }
  }, [conversations, selectedConversationId]);

  const persistConversation = async (conversation: ImageConversation) => {
    const nextConversations = sortImageConversations([
      conversation,
      ...conversationsRef.current.filter((item) => item.id !== conversation.id),
    ]);
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    await saveImageConversations(nextConversations);
  };

  const updateConversation = useCallback(
    async (
      conversationId: string,
      updater: (current: ImageConversation | null) => ImageConversation,
      options: { persist?: boolean } = {},
    ) => {
      const current = conversationsRef.current.find((item) => item.id === conversationId) ?? null;
      const nextConversation = updater(current);
      const nextConversations = sortImageConversations([
        nextConversation,
        ...conversationsRef.current.filter((item) => item.id !== conversationId),
      ]);
      conversationsRef.current = nextConversations;
      setConversations(nextConversations);
      if (options.persist !== false) {
        await saveImageConversations(nextConversations);
      }
    },
    [],
  );

  const clearComposerInputs = useCallback(() => {
    setImagePrompt("");
    setImageCount("1");
    setReferenceImageFiles([]);
    setReferenceImages([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const resetComposer = useCallback(() => {
    setImageMode("generate");
    clearComposerInputs();
  }, [clearComposerInputs]);

  const handleCreateDraft = () => {
    setSelectedConversationId(null);
    resetComposer();
    textareaRef.current?.focus();
  };

  const handleMobileCreateDraft = useCallback(() => {
    handleCreateDraft();
    setIsMobileSidebarOpen(false);
  }, [handleCreateDraft]);

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
    setIsMobileSidebarOpen(false);
  }, []);

  const handleDeleteConversation = async (id: string) => {
    const nextConversations = conversations.filter((item) => item.id !== id);
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    if (selectedConversationId === id) {
      setSelectedConversationId(pickFallbackConversationId(nextConversations));
      resetComposer();
    }

    try {
      await deleteImageConversation(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除会话失败";
      toast.error(message);
      const items = await listImageConversations();
      conversationsRef.current = items;
      setConversations(items);
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearImageConversations();
      conversationsRef.current = [];
      setConversations([]);
      setSelectedConversationId(null);
      resetComposer();
      toast.success("已清空历史记录");
    } catch (error) {
      const message = error instanceof Error ? error.message : "清空历史记录失败";
      toast.error(message);
    }
  };

  const handleMobileClearHistory = useCallback(async () => {
    await handleClearHistory();
    setIsMobileSidebarOpen(false);
  }, [handleClearHistory]);

  const appendReferenceImages = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    try {
      const previews = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type || "image/png",
          dataUrl: await readFileAsDataUrl(file),
        })),
      );

      setReferenceImageFiles((prev) => [...prev, ...files]);
      setReferenceImages((prev) => [...prev, ...previews]);
      setImageMode("edit");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取参考图失败";
      toast.error(message);
    }
  }, []);

  const handleReferenceImageChange = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      await appendReferenceImages(files);
    },
    [appendReferenceImages],
  );

  const handleRemoveReferenceImage = useCallback((index: number) => {
    setReferenceImageFiles((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      if (next.length === 0 && fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return next;
    });
    setReferenceImages((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const handleContinueEdit = useCallback(
    async (conversationId: string, image: StoredImage | StoredReferenceImage) => {
      try {
        let nextReferenceImage: StoredReferenceImage | null;
        if ("dataUrl" in image) {
          nextReferenceImage = image;
        } else if (image.b64_json) {
          nextReferenceImage = buildReferenceImageFromResult(image, `conversation-${conversationId}-${Date.now()}.png`);
        } else if (image.url) {
          const dataUrl = await fetchImageUrlAsDataUrl(image.url);
          nextReferenceImage = {
            name: `conversation-${conversationId}-${Date.now()}.png`,
            type: "image/png",
            dataUrl,
          };
        } else {
          nextReferenceImage = null;
        }
        if (!nextReferenceImage) {
          return;
        }

        setSelectedConversationId(conversationId);
        setImageMode("edit");
        setReferenceImages((prev) => [...prev, nextReferenceImage]);
        setReferenceImageFiles((prev) => [
          ...prev,
          dataUrlToFile(nextReferenceImage.dataUrl, nextReferenceImage.name, nextReferenceImage.type),
        ]);
        setImagePrompt("");
        textareaRef.current?.focus();
        toast.success("已加入当前参考图，继续输入描述即可编辑");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "读取参考图失败");
      }
    },
    [],
  );

  const openLightbox = useCallback((images: ImageLightboxItem[], index: number) => {
    if (images.length === 0) {
      return;
    }

    setLightboxImages(images);
    setLightboxIndex(Math.max(0, Math.min(index, images.length - 1)));
    setLightboxOpen(true);
  }, []);

  const runConversationQueue = useCallback(
    async (conversationId: string) => {
      if (activeConversationQueueIds.has(conversationId)) {
        return;
      }

      const snapshot = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const queuedTurn = snapshot?.turns.find((turn) => turn.status === "queued");
      if (!snapshot || !queuedTurn) {
        return;
      }
      if (queuedTurn.backendJobId || queuedTurn.deliveryMode === "image_bed") {
        return;
      }

      activeConversationQueueIds.add(conversationId);
      await updateConversation(conversationId, (current) => {
        const conversation = current ?? snapshot;
        return {
          ...conversation,
          updatedAt: new Date().toISOString(),
          turns: conversation.turns.map((turn) =>
            turn.id === queuedTurn.id
              ? {
                  ...turn,
                  status: "generating",
                  error: undefined,
                }
              : turn,
          ),
        };
      });

      try {
        const referenceFiles = queuedTurn.referenceImages.map((image, index) =>
          dataUrlToFile(image.dataUrl, image.name || `${queuedTurn.id}-${index + 1}.png`, image.type),
        );
        const pendingImages = queuedTurn.images.filter((image) => image.status === "loading");

        if (queuedTurn.mode === "edit" && referenceFiles.length === 0) {
          throw new Error("未找到可用于继续编辑的参考图");
        }

        if (pendingImages.length === 0) {
          const existingFailedCount = queuedTurn.images.filter((image) => image.status === "error").length;
          const existingSuccessCount = queuedTurn.images.filter((image) => image.status === "success").length;
          await updateConversation(conversationId, (current) => {
            const conversation = current ?? snapshot;
            return {
              ...conversation,
              updatedAt: new Date().toISOString(),
              turns: conversation.turns.map((turn) =>
                turn.id === queuedTurn.id
                  ? {
                      ...turn,
                      status: existingFailedCount > 0 ? "error" : existingSuccessCount > 0 ? "success" : "queued",
                      error: existingFailedCount > 0 ? `其中 ${existingFailedCount} 张未成功生成` : undefined,
                    }
                  : turn,
              ),
            };
          });
          return;
        }

        const tasks = pendingImages.map(async (pendingImage) => {
          try {
            const data =
              queuedTurn.mode === "edit"
                ? await editImage(referenceFiles, queuedTurn.prompt, queuedTurn.model, queuedTurn.deliveryMode)
                : await generateImage(queuedTurn.prompt, queuedTurn.model, queuedTurn.deliveryMode);
            const first = data.data?.[0];
            if (!first?.b64_json && !first?.url) {
              throw new Error("未返回图片数据");
            }

            const nextImage: StoredImage = {
              id: pendingImage.id,
              status: "success",
              b64_json: first.b64_json,
              url: first.url,
              urlExpiresAt: first.url_expires_at,
              storage: first.storage === "image_bed" ? "image_bed" : "direct",
            };

            await updateConversation(
              conversationId,
              (current) => {
                const conversation = current ?? snapshot;
                return {
                  ...conversation,
                  updatedAt: new Date().toISOString(),
                  turns: conversation.turns.map((turn) =>
                    turn.id === queuedTurn.id
                      ? {
                          ...turn,
                          images: turn.images.map((image) => (image.id === nextImage.id ? nextImage : image)),
                        }
                      : turn,
                  ),
                };
              },
              { persist: false },
            );

            return nextImage;
          } catch (error) {
            const message = error instanceof Error ? error.message : "生成失败";
            const failedImage: StoredImage = {
              id: pendingImage.id,
              status: "error",
              error: message,
            };

            await updateConversation(
              conversationId,
              (current) => {
                const conversation = current ?? snapshot;
                return {
                  ...conversation,
                  updatedAt: new Date().toISOString(),
                  turns: conversation.turns.map((turn) =>
                    turn.id === queuedTurn.id
                      ? {
                          ...turn,
                          images: turn.images.map((image) => (image.id === failedImage.id ? failedImage : image)),
                        }
                      : turn,
                  ),
                };
              },
              { persist: false },
            );

            throw error;
          }
        });

        const settled = await Promise.allSettled(tasks);
        const resumedSuccessCount = settled.filter(
          (item): item is PromiseFulfilledResult<StoredImage> => item.status === "fulfilled",
        ).length;
        const resumedFailedCount = settled.length - resumedSuccessCount;
        const existingSuccessCount = queuedTurn.images.filter((image) => image.status === "success").length;
        const existingFailedCount = queuedTurn.images.filter((image) => image.status === "error").length;
        const successCount = existingSuccessCount + resumedSuccessCount;
        const failedCount = existingFailedCount + resumedFailedCount;

        await updateConversation(conversationId, (current) => {
          const conversation = current ?? snapshot;
          return {
            ...conversation,
            updatedAt: new Date().toISOString(),
            turns: conversation.turns.map((turn) =>
              turn.id === queuedTurn.id
                ? {
                    ...turn,
                    status: failedCount > 0 ? "error" : "success",
                    error: failedCount > 0 ? `其中 ${failedCount} 张未成功生成` : undefined,
                  }
                : turn,
            ),
          };
        });

        await loadQuota();
      } catch (error) {
        const message = error instanceof Error ? error.message : "生成图片失败";
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? snapshot;
          return {
            ...conversation,
            updatedAt: new Date().toISOString(),
            turns: conversation.turns.map((turn) =>
              turn.id === queuedTurn.id
                ? {
                    ...turn,
                    status: "error",
                    error: message,
                    images: turn.images.map((image) =>
                      image.status === "loading" ? { ...image, status: "error", error: message } : image,
                    ),
                  }
                : turn,
            ),
          };
        });
        toast.error(message);
      } finally {
        activeConversationQueueIds.delete(conversationId);
        for (const conversation of conversationsRef.current) {
          if (
            !activeConversationQueueIds.has(conversation.id) &&
            conversation.turns.some((turn) => turn.status === "queued")
          ) {
            void runConversationQueue(conversation.id);
          }
        }
      }
    },
    [loadQuota, updateConversation],
  );

  useEffect(() => {
    for (const conversation of conversations) {
      if (
        !activeConversationQueueIds.has(conversation.id) &&
        conversation.turns.some((turn) => turn.status === "queued")
      ) {
        void runConversationQueue(conversation.id);
      }
    }
  }, [conversations, runConversationQueue]);

  const handleSubmit = async () => {
    const prompt = imagePrompt.trim();
    if (!prompt) {
      toast.error("请输入提示词");
      return;
    }

    if (imageMode === "edit" && referenceImageFiles.length === 0) {
      toast.error("请先上传参考图");
      return;
    }

    const targetConversation = selectedConversationId
      ? conversationsRef.current.find((conversation) => conversation.id === selectedConversationId) ?? null
      : null;
    const now = new Date().toISOString();
    const conversationId = targetConversation?.id ?? createId();
    const conversationTitle = targetConversation?.title ?? buildConversationTitle(prompt);
    const turnId = createId();
    const draftTurn: ImageTurn = {
      id: turnId,
      prompt,
      model: "auto",
      mode: imageMode,
      deliveryMode,
      referenceImages: imageMode === "edit" ? referenceImages : [],
      count: parsedCount,
      images: Array.from({ length: parsedCount }, (_, index) => ({
        id: `${turnId}-${index}`,
        status: "loading" as const,
      })),
      createdAt: now,
      status: "queued",
    };

    const baseConversation: ImageConversation = targetConversation
      ? {
          ...targetConversation,
          updatedAt: now,
          turns: [...targetConversation.turns, draftTurn],
        }
      : {
          id: conversationId,
          title: conversationTitle,
          createdAt: now,
          updatedAt: now,
          turns: [draftTurn],
        };

    setSelectedConversationId(conversationId);
    clearComposerInputs();

    await persistConversation(baseConversation);

    if (deliveryMode === "image_bed") {
      try {
        const data = await createImageJob({
          prompt,
          conversationId,
          conversationTitle,
          mode: imageMode,
          imageCount: parsedCount,
          model: "auto",
          files: imageMode === "edit" ? referenceImageFiles : [],
        });
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? baseConversation;
          return {
            ...conversation,
            updatedAt: data.item.updated_at,
            turns: conversation.turns.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    backendJobId: data.item.id,
                    status: mapJobStatusToTurnStatus(data.item.status),
                  }
                : turn,
            ),
          };
        });
        await syncImageJobs();
      } catch (error) {
        const message = error instanceof Error ? error.message : "提交图床任务失败";
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? baseConversation;
          return {
            ...conversation,
            updatedAt: new Date().toISOString(),
            turns: conversation.turns.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    status: "error",
                    error: message,
                    images: turn.images.map((image) => ({ ...image, status: "error", error: message })),
                  }
                : turn,
            ),
          };
        });
        toast.error(message);
        return;
      }
    } else {
      void runConversationQueue(conversationId);
    }

    const targetStats = getImageConversationStats(baseConversation);
    if (targetStats.running > 0 || targetStats.queued > 1) {
      toast.success("已加入当前对话队列");
    } else if (!targetConversation) {
      toast.success("已创建新对话并开始处理");
    } else {
      toast.success("已发送到当前对话");
    }
  };

  const handleRedeem = async () => {
    const keys = redeemText
      .split(/\r?\n|,|;|\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (keys.length === 0) {
      toast.error("请输入兑换码");
      return;
    }

    setIsRedeeming(true);
    try {
      await redeemUserQuota(keys);
      setRedeemText("");
      await loadQuota();
      toast.success(`已提交 ${keys.length} 个兑换码`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "兑换失败";
      toast.error(message);
    } finally {
      setIsRedeeming(false);
    }
  };

  if (!guardReady) {
    return null;
  }

  return (
    <>
      <Dialog open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="top-0 left-0 h-dvh w-[min(86vw,320px)] max-w-none translate-x-0 translate-y-0 rounded-none border-r border-stone-200/80 bg-[#f7f5f2] p-4 shadow-[0_12px_48px_rgba(16,24,40,0.18)] duration-300 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-3 px-1">
              <DialogTitle className="text-base font-semibold text-stone-900">对话列表</DialogTitle>
              <DialogDescription className="mt-1 text-xs text-stone-500">
                在手机上收起历史记录，把更多空间留给图片内容。
              </DialogDescription>
            </div>
            <ImageSidebar
              className="min-h-0 flex-1 border-r-0 pr-0"
              conversations={conversations}
              isLoadingHistory={isLoadingHistory}
              selectedConversationId={selectedConversationId}
              onCreateDraft={handleMobileCreateDraft}
              onClearHistory={handleMobileClearHistory}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              formatConversationTime={formatConversationTime}
            />
          </div>
        </DialogContent>
      </Dialog>

      <section className="mx-auto grid h-[calc(100vh-5rem)] min-h-0 w-full max-w-[1380px] grid-cols-1 gap-3 px-3 pb-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <ImageSidebar
          className="hidden lg:block"
          conversations={conversations}
          isLoadingHistory={isLoadingHistory}
          selectedConversationId={selectedConversationId}
          onCreateDraft={handleCreateDraft}
          onClearHistory={handleClearHistory}
          onSelectConversation={setSelectedConversationId}
          onDeleteConversation={handleDeleteConversation}
          formatConversationTime={formatConversationTime}
        />

        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3 px-2 sm:px-4">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-full border-stone-200 bg-white px-4 text-xs font-medium text-stone-700 shadow-none lg:hidden"
              onClick={() => setIsMobileSidebarOpen(true)}
            >
              <PanelLeft className="size-4" />
              对话列表
            </Button>

            {availableQuota !== "∞" ? (
              <Dialog open={isRedeemDialogOpen} onOpenChange={setIsRedeemDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="ml-auto h-9 rounded-full border-stone-200 bg-white px-4 text-xs font-medium text-stone-700 shadow-none"
                  >
                    剩余额度 {availableQuota}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>兑换额度</DialogTitle>
                    <DialogDescription>输入兑换码，每行一个；支持一次提交多个。</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Textarea
                      value={redeemText}
                      onChange={(event) => setRedeemText(event.target.value)}
                      placeholder="输入兑换码，每行一个；支持一次提交多个"
                      className="min-h-[88px] rounded-xl border-stone-100 px-3 py-2 text-sm leading-6"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl border-stone-200 bg-white px-4 text-stone-700"
                      onClick={() => void handleRedeem()}
                      disabled={!redeemText.trim() || isRedeeming}
                    >
                      {isRedeeming ? "兑换中..." : "兑换额度"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          <div
            ref={resultsViewportRef}
            className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4 sm:py-4"
          >
            <ImageResults
              selectedConversation={selectedConversation}
              onOpenLightbox={openLightbox}
              onContinueEdit={handleContinueEdit}
              formatConversationTime={formatConversationTime}
            />
          </div>

          <ImageComposer
            mode={imageMode}
            prompt={imagePrompt}
            imageCount={imageCount}
            deliveryMode={deliveryMode}
            availableDeliveryModes={availableDeliveryModes}
            showAllDeliveryModes={currentIdentity?.role === "admin"}
            activeTaskCount={activeTaskCount}
            referenceImages={referenceImages}
            textareaRef={textareaRef}
            fileInputRef={fileInputRef}
            onModeChange={setImageMode}
            onPromptChange={setImagePrompt}
            onImageCountChange={setImageCount}
            onDeliveryModeChange={setDeliveryMode}
            onSubmit={handleSubmit}
            onPickReferenceImage={() => fileInputRef.current?.click()}
            onReferenceImageChange={handleReferenceImageChange}
            onRemoveReferenceImage={handleRemoveReferenceImage}
          />
        </div>
      </section>

      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}
