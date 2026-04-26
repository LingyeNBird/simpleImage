"use client";

import { ArrowUp, ImagePlus, LoaderCircle, Settings2, X } from "lucide-react";
import { useMemo, useState, type ClipboardEvent, type RefObject } from "react";

import { ImageLightbox } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  IMAGE_RESPONSE_CANVAS_OPTIONS,
  IMAGE_RESPONSE_MODERATION_OPTIONS,
  IMAGE_RESPONSE_OUTPUT_FORMAT_OPTIONS,
  IMAGE_RESPONSE_QUALITY_OPTIONS,
  IMAGE_RESPONSE_REASONING_EFFORT_OPTIONS,
  IMAGE_RESPONSE_REASONING_SUMMARY_OPTIONS,
  IMAGE_RESPONSE_RESOLUTION_OPTIONS,
  IMAGE_RESPONSE_TOOL_CHOICE_OPTIONS,
  IMAGE_SIZE_LABELS,
  IMAGE_SIZE_OPTIONS,
  IMAGE_UPSTREAM_ENDPOINT_OPTIONS,
  type ImageResponseCanvas,
  type ImageResponseModeration,
  type ImageResponseOutputFormat,
  type ImageResponseQuality,
  type ImageResponseReasoningEffort,
  type ImageResponseReasoningSummary,
  type ImageResponseResolution,
  type ImageResponseToolChoice,
  type ImageUpstreamEndpoint,
} from "@/lib/image-generation-options";
import type { ImageDeliveryMode } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ImageConversationMode } from "@/store/image-conversations";

type ImageComposerProps = {
  mode: ImageConversationMode;
  prompt: string;
  imageCount: string;
  imageSize: string;
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
  deliveryMode: ImageDeliveryMode;
  availableDeliveryModes: ImageDeliveryMode[];
  showAllDeliveryModes?: boolean;
  activeTaskCount: number;
  referenceImages: Array<{ name: string; dataUrl: string }>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onModeChange: (value: ImageConversationMode) => void;
  onPromptChange: (value: string) => void;
  onImageCountChange: (value: string) => void;
  onImageSizeChange: (value: string) => void;
  onUpstreamEndpointChange: (value: ImageUpstreamEndpoint) => void;
  onResponseCanvasChange: (value: ImageResponseCanvas) => void;
  onResponseResolutionChange: (value: ImageResponseResolution) => void;
  onResponseQualityChange: (value: ImageResponseQuality) => void;
  onResponseOutputFormatChange: (value: ImageResponseOutputFormat) => void;
  onResponseOutputCompressionChange: (value: string) => void;
  onResponseModerationChange: (value: ImageResponseModeration) => void;
  onResponseMainModelChange: (value: string) => void;
  onResponseToolModelChange: (value: string) => void;
  onResponseInstructionsChange: (value: string) => void;
  onResponseReasoningEffortChange: (value: ImageResponseReasoningEffort) => void;
  onResponseReasoningSummaryChange: (value: ImageResponseReasoningSummary) => void;
  onResponseParallelToolCallsChange: (value: boolean) => void;
  onResponseIncludeEncryptedReasoningChange: (value: boolean) => void;
  onResponseStoreChange: (value: boolean) => void;
  onResponsePartialImagesChange: (value: string) => void;
  onResponseToolChoiceChange: (value: ImageResponseToolChoice) => void;
  onDeliveryModeChange: (value: ImageDeliveryMode) => void;
  onSubmit: () => void | Promise<void>;
  onPickReferenceImage: () => void;
  onReferenceImageChange: (files: File[]) => void | Promise<void>;
  onRemoveReferenceImage: (index: number) => void;
};

export function ImageComposer({
  mode,
  prompt,
  imageCount,
  imageSize,
  upstreamEndpoint,
  responseCanvas,
  responseResolution,
  responseQuality,
  responseOutputFormat,
  responseOutputCompression,
  responseModeration,
  responseMainModel,
  responseToolModel,
  responseInstructions,
  responseReasoningEffort,
  responseReasoningSummary,
  responseParallelToolCalls,
  responseIncludeEncryptedReasoning,
  responseStore,
  responsePartialImages,
  responseToolChoice,
  deliveryMode,
  availableDeliveryModes,
  showAllDeliveryModes = false,
  activeTaskCount,
  referenceImages,
  textareaRef,
  fileInputRef,
  onModeChange,
  onPromptChange,
  onImageCountChange,
  onImageSizeChange,
  onUpstreamEndpointChange,
  onResponseCanvasChange,
  onResponseResolutionChange,
  onResponseQualityChange,
  onResponseOutputFormatChange,
  onResponseOutputCompressionChange,
  onResponseModerationChange,
  onResponseMainModelChange,
  onResponseToolModelChange,
  onResponseInstructionsChange,
  onResponseReasoningEffortChange,
  onResponseReasoningSummaryChange,
  onResponseParallelToolCallsChange,
  onResponseIncludeEncryptedReasoningChange,
  onResponseStoreChange,
  onResponsePartialImagesChange,
  onResponseToolChoiceChange,
  onDeliveryModeChange,
  onSubmit,
  onPickReferenceImage,
  onReferenceImageChange,
  onRemoveReferenceImage,
}: ImageComposerProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const visibleDeliveryModes = useMemo<ImageDeliveryMode[]>(
    () => (showAllDeliveryModes ? ["direct", "image_bed"] : availableDeliveryModes),
    [availableDeliveryModes, showAllDeliveryModes],
  );
  const imageBedAvailable = availableDeliveryModes.includes("image_bed");
  const lightboxImages = useMemo(
    () => referenceImages.map((image, index) => ({ id: `${image.name}-${index}`, src: image.dataUrl })),
    [referenceImages],
  );
  const isResponseEndpoint = upstreamEndpoint === "response";

  const handleTextareaPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void onReferenceImageChange(imageFiles);
  };

  const deliveryModeDescription =
    deliveryMode === "image_bed"
      ? "使用图床，避免出现连接问题"
      : showAllDeliveryModes && !imageBedAvailable
        ? "图床模式暂未就绪，请先在存储桶管理中完成 COS 配置"
        : "直接传输图片，耗时较久";

  const settingsSummary = `${mode === "edit" ? "图生图" : "文生图"} · ${imageCount || "1"} 张 · ${isResponseEndpoint ? "/response" : "/conversation"}${visibleDeliveryModes.length > 1 ? ` · ${deliveryMode === "image_bed" ? "图床" : "直传"}` : ""}`;

  return (
    <div className="shrink-0 flex justify-center">
      <div style={{ width: "min(980px, 100%)" }}>
        {mode === "edit" && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void onReferenceImageChange(Array.from(event.target.files || []));
            }}
          />
        )}

        {mode === "edit" && referenceImages.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2 px-1">
            {referenceImages.map((image, index) => (
              <div key={`${image.name}-${index}`} className="relative size-16">
                <button
                  type="button"
                  onClick={() => {
                    setLightboxIndex(index);
                    setLightboxOpen(true);
                  }}
                  className="group size-16 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 transition hover:border-stone-300"
                  aria-label={`预览参考图 ${image.name || index + 1}`}
                >
                  <img
                    src={image.dataUrl}
                    alt={image.name || `参考图 ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveReferenceImage(index);
                  }}
                  className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-stone-800"
                  aria-label={`移除参考图 ${image.name || index + 1}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white">
          <div
            className="relative cursor-text"
            onClick={() => {
              textareaRef.current?.focus();
            }}
          >
            <ImageLightbox
              images={lightboxImages}
              currentIndex={lightboxIndex}
              open={lightboxOpen}
              onOpenChange={setLightboxOpen}
              onIndexChange={setLightboxIndex}
            />
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              onPaste={handleTextareaPaste}
              placeholder={
                mode === "edit" ? "描述你希望如何修改这张参考图，可直接粘贴图片" : "输入你想要生成的画面，也可直接粘贴图片"
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              className="min-h-[148px] resize-none rounded-[32px] border-0 bg-transparent px-6 pt-6 pb-20 text-[15px] leading-7 text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0"
            />

            <div
              className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-4 pt-6 sm:px-6"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="flex items-end justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  {mode === "edit" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-full border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 shadow-none"
                      onClick={onPickReferenceImage}
                    >
                      <ImagePlus className="size-4" />
                      {referenceImages.length > 0 ? "继续添加参考图" : "上传参考图"}
                    </Button>
                  ) : null}
                  {activeTaskCount > 0 ? (
                    <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      <LoaderCircle className="size-3 animate-spin" />
                      {activeTaskCount} 个任务处理中或排队中
                     </div>
                  ) : null}
                  <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-full border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 shadow-none"
                      >
                        <Settings2 className="size-4" />
                        生图设置
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[min(92vw,420px)] rounded-[28px] p-5">
                      <DialogHeader>
                        <DialogTitle>生图设置</DialogTitle>
                        <DialogDescription>{settingsSummary}</DialogDescription>
                      </DialogHeader>

                        <div className="flex flex-col gap-5">
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                          <span className="text-sm font-medium text-stone-700">上游端点</span>
                          <Select value={upstreamEndpoint} onValueChange={(value) => onUpstreamEndpointChange(value as ImageUpstreamEndpoint)}>
                            <SelectTrigger className="h-9 min-w-[160px] rounded-full border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-none focus-visible:ring-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {IMAGE_UPSTREAM_ENDPOINT_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                          <span className="text-sm font-medium text-stone-700">生成张数</span>
                          <Input
                            type="number"
                            min="1"
                            max="10"
                            step="1"
                            value={imageCount}
                            onChange={(event) => onImageCountChange(event.target.value)}
                            className="h-9 w-20 rounded-full border-stone-200 bg-white px-3 text-center text-sm font-medium text-stone-700"
                          />
                        </div>

                        {isResponseEndpoint ? (
                          <>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                              <span className="text-sm font-medium text-stone-700">画布</span>
                              <Select value={responseCanvas} onValueChange={(value) => onResponseCanvasChange(value as ImageResponseCanvas)}>
                                <SelectTrigger className="h-9 min-w-[140px] rounded-full border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-none focus-visible:ring-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {IMAGE_RESPONSE_CANVAS_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                              <span className="text-sm font-medium text-stone-700">分辨率</span>
                              <Select value={responseResolution} onValueChange={(value) => onResponseResolutionChange(value as ImageResponseResolution)}>
                                <SelectTrigger className="h-9 min-w-[148px] rounded-full border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-none focus-visible:ring-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {IMAGE_RESPONSE_RESOLUTION_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                              <span className="text-sm font-medium text-stone-700">质量</span>
                              <Select value={responseQuality} onValueChange={(value) => onResponseQualityChange(value as ImageResponseQuality)}>
                                <SelectTrigger className="h-9 min-w-[132px] rounded-full border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-none focus-visible:ring-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {IMAGE_RESPONSE_QUALITY_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                              <span className="text-sm font-medium text-stone-700">输出格式</span>
                              <Select value={responseOutputFormat} onValueChange={(value) => onResponseOutputFormatChange(value as ImageResponseOutputFormat)}>
                                <SelectTrigger className="h-9 min-w-[132px] rounded-full border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-none focus-visible:ring-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {IMAGE_RESPONSE_OUTPUT_FORMAT_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                              <span className="text-sm font-medium text-stone-700">压缩率</span>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={responseOutputCompression === "auto" ? "" : responseOutputCompression}
                                onChange={(event) => onResponseOutputCompressionChange(event.target.value || "auto")}
                                disabled={responseOutputFormat === "png"}
                                placeholder={responseOutputFormat === "png" ? "PNG 无压缩" : "自动"}
                                className="h-9 w-28 rounded-full border-stone-200 bg-white px-3 text-center text-sm font-medium text-stone-700 disabled:bg-stone-100 disabled:text-stone-400"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                              <span className="text-sm font-medium text-stone-700">审核强度</span>
                              <Select value={responseModeration} onValueChange={(value) => onResponseModerationChange(value as ImageResponseModeration)}>
                                <SelectTrigger className="h-9 min-w-[132px] rounded-full border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-none focus-visible:ring-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {IMAGE_RESPONSE_MODERATION_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                              <div className="text-sm font-medium text-stone-700">Response 模型设置</div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-stone-700">主模型</span>
                                <Input
                                  value={responseMainModel}
                                  onChange={(event) => onResponseMainModelChange(event.target.value)}
                                  className="h-9 w-[180px] rounded-full border-stone-200 bg-white px-3 text-sm text-stone-700"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-stone-700">工具模型</span>
                                <Input
                                  value={responseToolModel}
                                  onChange={(event) => onResponseToolModelChange(event.target.value)}
                                  placeholder="auto / gpt-image-2"
                                  className="h-9 w-[180px] rounded-full border-stone-200 bg-white px-3 text-sm text-stone-700"
                                />
                              </div>
                            </div>
                            <div className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                              <div className="text-sm font-medium text-stone-700">Response 推理设置</div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-stone-700">推理强度</span>
                                <Select value={responseReasoningEffort} onValueChange={(value) => onResponseReasoningEffortChange(value as ImageResponseReasoningEffort)}>
                                  <SelectTrigger className="h-9 min-w-[132px] rounded-full border-stone-200 bg-white px-3 text-sm text-stone-700 shadow-none focus-visible:ring-0">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {IMAGE_RESPONSE_REASONING_EFFORT_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-stone-700">推理摘要</span>
                                <Select value={responseReasoningSummary} onValueChange={(value) => onResponseReasoningSummaryChange(value as ImageResponseReasoningSummary)}>
                                  <SelectTrigger className="h-9 min-w-[132px] rounded-full border-stone-200 bg-white px-3 text-sm text-stone-700 shadow-none focus-visible:ring-0">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {IMAGE_RESPONSE_REASONING_SUMMARY_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-stone-700">阶段预览数</span>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={responsePartialImages}
                                  onChange={(event) => onResponsePartialImagesChange(event.target.value)}
                                  className="h-9 w-28 rounded-full border-stone-200 bg-white px-3 text-center text-sm text-stone-700"
                                />
                              </div>
                            </div>
                            <div className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                              <div className="text-sm font-medium text-stone-700">Response 行为设置</div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-stone-700">工具选择</span>
                                <Select value={responseToolChoice} onValueChange={(value) => onResponseToolChoiceChange(value as ImageResponseToolChoice)}>
                                  <SelectTrigger className="h-9 min-w-[132px] rounded-full border-stone-200 bg-white px-3 text-sm text-stone-700 shadow-none focus-visible:ring-0">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {IMAGE_RESPONSE_TOOL_CHOICE_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <label className="text-sm text-stone-700" htmlFor="response-parallel-tool-calls">并行工具调用</label>
                                <Checkbox
                                  id="response-parallel-tool-calls"
                                  checked={responseParallelToolCalls}
                                  onCheckedChange={(checked) => onResponseParallelToolCallsChange(Boolean(checked))}
                                />
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <label className="text-sm text-stone-700" htmlFor="response-encrypted-reasoning">返回加密推理</label>
                                <Checkbox
                                  id="response-encrypted-reasoning"
                                  checked={responseIncludeEncryptedReasoning}
                                  onCheckedChange={(checked) => onResponseIncludeEncryptedReasoningChange(Boolean(checked))}
                                />
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <label className="text-sm text-stone-700" htmlFor="response-store">保存到上游 store</label>
                                <Checkbox id="response-store" checked={responseStore} onCheckedChange={(checked) => onResponseStoreChange(Boolean(checked))} />
                              </div>
                            </div>
                            <div className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                              <div className="text-sm font-medium text-stone-700">系统指令</div>
                              <Textarea
                                value={responseInstructions}
                                onChange={(event) => onResponseInstructionsChange(event.target.value)}
                                placeholder="可选，补充给 Responses 主模型的 instructions"
                                className="min-h-24 rounded-2xl border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-none focus-visible:ring-0"
                              />
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                            <span className="text-sm font-medium text-stone-700">图片比例</span>
                            <Select value={imageSize} onValueChange={onImageSizeChange}>
                              <SelectTrigger
                                className="h-9 min-w-[140px] rounded-full border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-none focus-visible:ring-0"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {IMAGE_SIZE_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {IMAGE_SIZE_LABELS[option] || option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {visibleDeliveryModes.length > 1 ? (
                          <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                            <div className="text-sm font-medium text-stone-700">传输模式</div>
                            <div className="flex flex-wrap gap-2">
                              {visibleDeliveryModes.includes("direct") ? (
                                <ModeButton
                                  active={deliveryMode === "direct"}
                                  onClick={() => onDeliveryModeChange("direct")}
                                  title="直接传输图片，耗时较久"
                                >
                                  直传
                                </ModeButton>
                              ) : null}
                              {visibleDeliveryModes.includes("image_bed") ? (
                                <ModeButton
                                  active={deliveryMode === "image_bed"}
                                  disabled={!imageBedAvailable}
                                  onClick={() => onDeliveryModeChange("image_bed")}
                                  title={imageBedAvailable ? "使用图床，避免出现连接问题" : "请先在存储桶管理中配置可用图床"}
                                >
                                  图床
                                </ModeButton>
                              ) : null}
                            </div>
                            <div className="text-xs leading-5 text-stone-500">{deliveryModeDescription}</div>
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                          <div className="text-sm font-medium text-stone-700">生图类型</div>
                          <div className="flex flex-wrap gap-2">
                            <ModeButton active={mode === "generate"} onClick={() => onModeChange("generate")}>
                              文生图
                            </ModeButton>
                            <ModeButton active={mode === "edit"} onClick={() => onModeChange("edit")}>
                              图生图
                            </ModeButton>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                </div>

                <button
                  type="button"
                  onClick={() => void onSubmit()}
                  disabled={!prompt.trim() || (mode === "edit" && referenceImages.length === 0)}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                  aria-label={mode === "edit" ? "编辑图片" : "生成图片"}
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  children,
  onClick,
  disabled,
  title,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) {
          onClick();
        }
      }}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition",
        active
          ? "bg-stone-950 text-white"
          : disabled
            ? "cursor-not-allowed bg-stone-100 text-stone-400"
            : "bg-stone-100 text-stone-600 hover:bg-stone-200",
      )}
    >
      {children}
    </button>
  );
}
