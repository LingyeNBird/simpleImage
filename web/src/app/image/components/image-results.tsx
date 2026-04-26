"use client";

import { Clock3, Copy, FileText, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { ImageConversation, ImageTurnStatus, StoredImage, StoredReferenceImage } from "@/store/image-conversations";

export type ImageLightboxItem = {
  id: string;
  src: string;
};

type ImageResultsProps = {
  selectedConversation: ImageConversation | null;
  canViewFailureLog: boolean;
  onOpenLightbox: (images: ImageLightboxItem[], index: number) => void;
  onContinueEdit: (conversationId: string, image: StoredImage | StoredReferenceImage) => void;
  onUploadPrompt: (prompt: string) => void;
  formatConversationTime: (value: string) => string;
};

export function ImageResults({
  selectedConversation,
  canViewFailureLog,
  onOpenLightbox,
  onContinueEdit,
  onUploadPrompt,
  formatConversationTime,
}: ImageResultsProps) {
  const [failureLogDialog, setFailureLogDialog] = useState<{ title: string; content: string } | null>(null);

  const copyImageUrl = async (url: string) => {
    try {
      await copyTextToClipboard(url);
      toast.success("已复制临时图床链接");
    } catch {
      toast.error("复制链接失败");
    }
  };

  const copyFailureLog = async (content: string) => {
    try {
      await copyTextToClipboard(content);
      toast.success("已复制失败日志");
    } catch {
      toast.error("复制失败日志失败");
    }
  };

  const formatUrlExpireText = (value?: string) => {
    const text = String(value || "").trim();
    if (!text) {
      return "URL 将在图床清理时效到期后失效，请尽快下载";
    }
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
      return "URL 将在图床清理时效到期后失效，请尽快下载";
    }
    return `URL 将在 ${new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)} 后失效，请尽快下载`;
  };

  if (!selectedConversation) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center text-center">
        <div className="w-full max-w-4xl">
          <h1
            className="text-3xl font-semibold tracking-tight text-stone-950 md:text-5xl"
            style={{
              fontFamily: '"Palatino Linotype","Book Antiqua","URW Palladio L","Times New Roman",serif',
            }}
          >
            Turn ideas into images
          </h1>
          <p
            className="mt-4 text-[15px] italic tracking-[0.01em] text-stone-500"
            style={{
              fontFamily: '"Palatino Linotype","Book Antiqua","URW Palladio L","Times New Roman",serif',
            }}
          >
            在同一窗口里保留本地历史与任务状态，并从已有结果图继续发起新的无状态编辑。
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Dialog open={Boolean(failureLogDialog)} onOpenChange={(open) => !open && setFailureLogDialog(null)}>
        <DialogContent className="w-[min(96vw,780px)] rounded-[28px] border-stone-200 p-0 overflow-hidden">
          <DialogHeader className="border-b border-stone-200 bg-white px-5 pb-4 pt-5 sm:px-6">
            <DialogTitle>{failureLogDialog?.title || "失败日志"}</DialogTitle>
            <DialogDescription>可复制完整链路日志，便于排查上游请求、权限或图床流程问题。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 bg-stone-50 px-5 py-5 sm:px-6">
            <Textarea
              value={failureLogDialog?.content || ""}
              readOnly
              className="min-h-[360px] rounded-3xl border-stone-200 bg-white px-4 py-3 font-mono text-xs leading-6 text-stone-700 shadow-none focus-visible:ring-0"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                onClick={() => void copyFailureLog(failureLogDialog?.content || "")}
              >
                <Copy className="size-4" />
                复制日志
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-8">
      {selectedConversation.turns.map((turn, turnIndex) => {
        const referenceLightboxImages = turn.referenceImages.map((image, index) => ({
          id: `${turn.id}-reference-${index}`,
          src: image.dataUrl,
        }));
        const successfulTurnImages = turn.images.flatMap((image) =>
          image.status === "success" && (image.b64_json || image.url)
            ? [{ id: image.id, src: image.b64_json ? `data:image/png;base64,${image.b64_json}` : String(image.url || "") }]
            : [],
        );

        return (
          <div key={turn.id} className="flex flex-col gap-4">
            <div className="flex justify-end">
              <div className="max-w-[82%] px-1 py-1 text-[15px] leading-7 text-stone-900">
                <div className="mb-2 flex flex-wrap justify-end gap-2 text-[11px] text-stone-400">
                  <span>第 {turnIndex + 1} 轮</span>
                  <span>
                    {turn.mode === "edit" ? "编辑图" : "文生图"}
                  </span>
                  <span>{getTurnStatusLabel(turn.status)}</span>
                  <span>{formatConversationTime(turn.createdAt)}</span>
                </div>
                <div className="text-right">{turn.prompt}</div>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                    onClick={() => onUploadPrompt(turn.prompt)}
                  >
                    上传到提示词库
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-start">
              <div className="w-full p-1">
                {turn.referenceImages.length > 0 ? (
                  <div className="mb-4 flex flex-col items-end">
                    <div className="mb-3 text-xs font-medium text-stone-500">本轮参考图</div>
                    <div className="flex flex-wrap justify-end gap-3">
                      {turn.referenceImages.map((image, index) => (
                        <div key={`${turn.id}-${image.name}-${index}`} className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenLightbox(referenceLightboxImages, index)}
                            className="group relative h-24 w-24 overflow-hidden border border-stone-200/80 bg-stone-100/60 text-left transition hover:border-stone-300"
                            aria-label={`预览参考图 ${image.name || index + 1}`}
                          >
                            <img
                              src={image.dataUrl}
                              alt={image.name || `参考图 ${index + 1}`}
                              className="absolute inset-0 h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                            />
                          </button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                            onClick={() => onContinueEdit(selectedConversation.id, image)}
                          >
                            <Sparkles className="size-4" />
                            加入编辑
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span className="rounded-full bg-stone-100 px-3 py-1">{turn.count} 张</span>
                  <span className="rounded-full bg-stone-100 px-3 py-1">{getTurnStatusLabel(turn.status)}</span>
                  <span className="rounded-full bg-stone-100 px-3 py-1">{turn.deliveryMode === "image_bed" ? "图床模式" : "直传模式"}</span>
                  {turn.status === "queued" ? (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">等待当前对话中的前序任务完成</span>
                  ) : null}
                </div>

                <div className="columns-1 gap-4 space-y-4 sm:columns-2 xl:columns-3">
                  {turn.images.map((image, index) => {
                    if (image.status === "success" && (image.b64_json || image.url)) {
                      const currentIndex = successfulTurnImages.findIndex((item) => item.id === image.id);
                      const src = image.b64_json ? `data:image/png;base64,${image.b64_json}` : String(image.url || "");

                      return (
                        <div
                          key={image.id}
                          className="break-inside-avoid overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenLightbox(successfulTurnImages, currentIndex)}
                            className="group block w-full cursor-zoom-in"
                          >
                            <img
                              src={src}
                              alt={`Generated result ${index + 1}`}
                              className="block h-auto w-full transition duration-200 group-hover:brightness-90"
                            />
                          </button>
                          <div className="flex flex-col gap-3 px-3 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs text-stone-500">结果 {index + 1}</div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                                onClick={() => onContinueEdit(selectedConversation.id, image)}
                              >
                                <Sparkles className="size-4" />
                                加入编辑
                              </Button>
                            </div>
                            {image.url ? (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                <a
                                  href={image.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs leading-5 text-sky-600 underline underline-offset-2"
                                >
                                  打开临时图床链接
                                </a>
                                <Button
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                                >
                                  <a href={image.url} download target="_blank" rel="noreferrer">
                                    下载图片
                                  </a>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                                  onClick={() => void copyImageUrl(image.url || "")}
                                  >
                                    复制链接
                                  </Button>
                                </div>
                                <div className="text-xs leading-5 text-amber-600">
                                  {formatUrlExpireText(image.urlExpiresAt)}
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    if (image.status === "error") {
                      return (
                        <div
                          key={image.id}
                          className="break-inside-avoid overflow-hidden border border-rose-200 bg-rose-50"
                        >
                          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 px-6 py-8 text-center text-sm leading-6 text-rose-600">
                            <div>{image.error || "生成失败"}</div>
                            {canViewFailureLog && image.failureLog ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-full border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                                onClick={() => setFailureLogDialog({ title: `失败日志 · 结果 ${index + 1}`, content: image.failureLog || "" })}
                              >
                                <FileText className="size-4" />
                                查看日志
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={image.id}
                        className="break-inside-avoid overflow-hidden border border-stone-200/80 bg-stone-100/80"
                      >
                        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-8 text-center text-stone-500">
                          <div className="rounded-full bg-white p-3 shadow-sm">
                            {turn.status === "queued" ? (
                              <Clock3 className="size-5" />
                            ) : (
                              <LoaderCircle className="size-5 animate-spin" />
                            )}
                          </div>
                          <p className="text-sm">{turn.status === "queued" ? "已加入当前对话队列..." : "正在处理图片..."}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {turn.status === "error" && turn.error ? (
                  <div className="mt-4 space-y-3 border-l-2 border-amber-300 bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-700">
                    <div>{turn.error}</div>
                    {canViewFailureLog && turn.failureLog ? (
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                          onClick={() => setFailureLogDialog({ title: `失败日志 · 第 ${turnIndex + 1} 轮`, content: turn.failureLog || "" })}
                        >
                          <FileText className="size-4" />
                          查看日志
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}

function getTurnStatusLabel(status: ImageTurnStatus) {
  if (status === "queued") {
    return "排队中";
  }
  if (status === "generating") {
    return "处理中";
  }
  if (status === "success") {
    return "已完成";
  }
  return "失败";
}
